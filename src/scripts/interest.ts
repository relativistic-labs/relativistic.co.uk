/**
 * The register-your-interest form. The package actions ("Request a free trial", "Request a demo")
 * choose their option before the page moves to the form.
 *
 * On Cloudflare (data-send="worker") sending posts the form to the site's Worker, which emails the
 * team, and the page says whether it arrived. On GitHub Pages (data-send="mailto") there's no server:
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

  // The browser has already checked the required fields when this fires.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.dataset['send'] === 'worker') void send(form, status, emailLink);
    else writeEmail(form, status, email, emailLink);
  });
}

async function send(form: HTMLFormElement, status: HTMLElement, emailLink: () => HTMLAnchorElement): Promise<void> {
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
    status.textContent = status.dataset['received']!;
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
