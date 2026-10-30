/**
 * The register-your-interest form. The package actions ("Request a free trial", "Request a demo")
 * choose their option before the page moves to the form. Sending writes an email, with everything
 * the visitor entered, for their own email app to send: nothing leaves the page until they send it.
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

  // The browser has already checked the required fields when this fires.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
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
    const email = form.dataset['email']!;
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // The same email again, as a link, in case the app didn't open.
    const link = document.createElement('a');
    link.href = url;
    link.textContent = email;
    status.replaceChildren(`${status.dataset['sent']} `, link, '.');
    location.href = url;
  });
}
