/**
 * The register-your-interest form. The package actions ("Request a free trial", "Request a demo")
 * choose their option before the page moves to the form.
 *
 * On Cloudflare (data-send="worker") sending posts the form to the site's Worker, which emails the
 * team. Once it arrives, a "Message sent" panel takes the form's place until they choose to send
 * another; if it fails, the form stays, with what they typed, and says so. On GitHub Pages (data-send="mailto") there's no server:
 * sending writes an email, with everything the visitor entered, for their own email app to send.
 */
export function initInterest(): void {
  const form = document.querySelector<HTMLFormElement>('[data-interest-form]');
  const status = document.querySelector<HTMLElement>('[data-interest-status]');
  if (!form || !status) return;

  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-interest]')) {
    link.addEventListener('click', () => {
      const choice = form.querySelector<HTMLInputElement>(`#interest-${link.dataset['interest']}`);
      if (choice) choice.checked = true;
      // After the jump, so the form's start is in view.
      requestAnimationFrame(() => form.querySelector('input')?.focus({ preventScroll: true }));
    });
  }

  const email = form.dataset['email']!;
  const emailLink = (href = `mailto:${email}`) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = email;
    return link;
  };

  const done = document.querySelector<HTMLElement>('[data-interest-done]');
  done?.querySelector('[data-interest-again]')?.addEventListener('click', () => {
    done.hidden = true;
    form.hidden = false;
    form.querySelector('input')?.focus();
  });

  // The browser has already checked the required fields when this fires.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.dataset['send'] === 'worker' && done) void send(form, status, done, emailLink);
    else writeEmail(form, status, email, emailLink);
  });
}

async function send(form: HTMLFormElement, status: HTMLElement, done: HTMLElement, emailLink: () => HTMLAnchorElement): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = status.dataset['sending']!;
  let sent = false;
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams(new FormData(form) as unknown as Record<string, string>),
    });
    sent = response.ok;
  } catch {
    // Offline, or the request never reached us: the same as a failure on our side.
  }
  button.disabled = false;
  if (sent) {
    form.reset();
    status.textContent = '';
    form.hidden = true;
    done.hidden = false;
    // The whole message in the middle of the screen, and the heading focused so screen readers read it.
    done.scrollIntoView({ block: 'center' });
    done.querySelector<HTMLElement>('h3')!.focus({ preventScroll: true });
  } else {
    // Everything they typed is still in the form, so trying again costs nothing.
    status.replaceChildren(`${status.dataset['failed']} `, emailLink(), '.');
  }
}

function writeEmail(form: HTMLFormElement, status: HTMLElement, email: string, emailLink: (href?: string) => HTMLAnchorElement): void {
  const data = new FormData(form);
  const get = (name: string) => String(data.get(name) ?? '').trim();
  const subject = `${get('interest')}: ${get('organisation') || get('name')}`;
  const body = [
    `Name: ${get('name')}`,
    `Email: ${get('email')}`,
    `Organisation: ${get('organisation')}`,
    `Interested in: ${get('interest')}`,
    '',
    get('build'),
  ].join('\n');
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // The same email again, as a link, in case the app didn't open.
  status.replaceChildren(`${status.dataset['sent']} `, emailLink(url), '.');
  location.href = url;
}
