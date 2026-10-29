/**
 * Page copy, from the round 3 brief (28 October 2026). Review drafts, not approved copy.
 * Used by the HTML components and by /index.md, so both say the same thing.
 * Each section after the opening carries the reader's question as a caption.
 * Founders are a content collection; everything else is here.
 */

export const opening = {
  headline: 'Agents can build what your people need. We give them somewhere safe to build it.',
  lede: [
    'Give your whole team the power of vibe coding, safely, with no technical experience needed. Financial reports, sales pitches, apps, documents and more, built in hours.',
    'We’re five senior engineers who have done this inside some of the UK’s largest organisations. We’ll show you where to start, keep you safe and build it with you.',
  ],
  action: 'Talk to us',
} as const;

export const example = {
  question: 'What could our people do?',
  heading: 'Ask for it in the morning. Use it that afternoon.',
  paragraphs: [
    'Say your sales director wants to know which customers might leave. They’ve never tried vibe coding, but need no experience: they describe it in plain words. An agent builds a dashboard from your customer records and invoices, and keeps it up to date. Anyone allowed to see those records can open it. Nobody else can.',
    'That’s one request from one person. Imagine everyone in your organisation doing the same.',
  ],
  diagram: {
    title: 'The example, as a diagram',
    description:
      'The sales director asks an agent for a dashboard. The agent reads the customer records and invoices it was granted; payroll was not granted. It builds the dashboard. The sales team can open it. Anyone else is refused, because they can’t see the records.',
  },
} as const;

export const help = {
  question: 'How would you help us?',
  heading: 'We guide you, guard you and build with you',
  items: [
    { term: 'We guide you.', text: 'We find the first wins with you, train your people and stay with you as AI changes.' },
    { term: 'We guard you.', text: 'We keep the bandits out: leaked data, runaway bills and agents that go where they shouldn’t.' },
    {
      term: 'We build with you.',
      text: 'We’re engineers first. We connect agents to the systems you already use and build the first tools alongside your teams.',
    },
  ],
} as const;

export const packages = {
  question: 'Where do we start?',
  heading: 'Three ways to start',
  // Each action leads to the form in the contact section, with its choice already made.
  items: [
    {
      name: 'Shared',
      tag: 'Teams and trials',
      text: 'A space on our platform. Sign in and start building the same day.',
      action: 'Request a free trial',
      interest: 'trial',
    },
    {
      name: 'Managed',
      tag: 'Small and medium businesses',
      text: 'Your own platform, set up and run for you, and connected to the tools your business already uses.',
      action: 'Request a demo',
      interest: 'managed',
    },
    {
      name: 'Enterprise',
      tag: 'Large organisations',
      text: 'Hosted where you need it: on our platform, in your cloud or on your own servers, with your data kept in the UK. Your sign-in, your choice of AI and help through security approval.',
      action: 'Request a demo',
      interest: 'enterprise',
    },
  ],
  money: 'Every package has a monthly price, and AI usage stays within a budget you set.',
} as const;

// Claims the founders must agree before launch: see the round 3 brief, "Claims that still need the founders".
export const trust = {
  question: 'Is it safe?',
  heading: 'Your data, your rules',
  inset: 'Agents start with access to nothing. You decide what they can reach.',
  rows: [
    { key: 'Where it runs', value: 'Our platform, your cloud or your own servers, with data kept in the UK if you need it' },
    { key: 'What agents can reach', value: 'Only what you allow. They never see passwords or keys' },
    { key: 'Who can open their work', value: 'Only people allowed to see the data behind it' },
    { key: 'AI models', value: 'Your choice: Anthropic, OpenAI, Google, open models or your own' },
    { key: 'Training', value: 'We never use your data to train AI' },
    { key: 'Spending', value: 'Stops at the limit you set' },
    { key: 'Records', value: 'Every action is recorded against the person who asked' },
    { key: 'Data protection', value: 'Built for UK GDPR. We help with your data protection impact assessment' },
    { key: 'Leaving', value: 'Take your apps and data with you' },
  ],
} as const;

export const story = {
  question: 'Why you?',
  heading: 'Our story',
  paragraphs: [
    'We met building data and AI platforms for HMRC. We made AI available to staff safely and cut the time to start from months to hours.',
    'Nothing we built was as useful as an agent let loose on a problem. But most people had no safe way to use one.',
    'So we built that safe way, on open-source foundations including Cloudflare OS, so you’re never tied to one supplier.',
  ],
} as const;

export const team = {
  question: 'Who are you?',
  heading: 'The team',
} as const;

// The sketch of the workspace: four requests, and what each one builds (components/Demo.astro).
export const demo = {
  question: 'What does it look like?',
  heading: 'Ask in plain words. Watch it appear.',
  caption:
    'A sketch of the workspace. Someone asks for a pitch deck, a quarterly sales report, charts of delivery performance and a design for a new app feature, and each one appears beside the conversation.',
  project: 'Our workspace',
  scenes: [
    {
      ask: 'Build me a pitch deck for our new product launch',
      reply: 'Here’s a six-slide deck in your brand, from the launch brief.',
      title: 'Launch pitch deck',
    },
    {
      ask: 'Create a quarterly sales report for the board',
      reply: 'Here’s the Q3 report, from this quarter’s invoices.',
      title: 'Q3 sales report',
    },
    {
      ask: 'Create a set of visualisations to help me understand our delivery performance',
      reply: 'Here are four views of the last six months.',
      title: 'Delivery performance',
    },
    {
      ask: 'I want to design a new feature for our app, so customers can rebook a delivery',
      reply: 'Here’s a first design: rebooking in three steps.',
      title: 'Rebook a delivery',
    },
  ],
} as const;

/**
 * The form writes an email for the visitor to send from their own email app: there's no server, and
 * nothing is sent or stored until they send it. Without JavaScript it's a mailto: form.
 */
export const contact = {
  question: 'How do we start?',
  heading: 'Register your interest',
  body: 'Tell us what you’d like your people to build. One of the five of us will reply.',
  fields: { name: 'Your name', email: 'Work email', organisation: 'Organisation', build: 'What would your people build?' },
  optional: '(optional)',
  choice: 'What would you like?',
  choices: [
    { value: 'interest', label: 'To hear when we launch' },
    { value: 'trial', label: 'A free trial of Shared' },
    { value: 'managed', label: 'A demo of Managed' },
    { value: 'enterprise', label: 'A demo of Enterprise' },
  ],
  submit: 'Register your interest',
  hint: 'This opens your email app with a message to us, ready to send.',
  sent: 'Your email app should now have a message to us, ready to send. If it didn’t open, email us at',
  or: 'Or email us at',
} as const;

// Off since round 3 (the choice of models is a row in the safety list); kept for later.
export const models = {
  question: 'Which models?',
  heading: 'You choose the models',
  before: 'Use the AI you prefer, run open models on your own servers, or use',
  after: 'Every request is checked and recorded the same way, whichever you choose.',
} as const;

// Off until the safeguarding lead's five questions have answers; kept for later.
export const sponsorship = {
  question: 'Could this help a community?',
  heading: 'Simple enough for a volunteer. Contained enough for a classroom.',
  body: 'Fund AI for a code club, school or charity and we’ll set them up. It runs in a browser, and they sign in with accounts they already have. Nothing reaches the internet or any data unless an organiser allows it, and spending stops at your budget. Your people can volunteer as mentors. You get a short report of what was made and the learning hours delivered.',
  ask: 'We’re looking for our first two sponsors.',
  action: 'Talk to us',
} as const;
