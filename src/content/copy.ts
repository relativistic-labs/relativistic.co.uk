/**
 * Page copy. Review drafts, not approved copy (build brief, 28 October 2026, and round 2 changes).
 * Used by the HTML components and by /index.md, so both say the same thing.
 * Each section after the opening carries the reader's question, shown in the margin.
 * Founders and the model providers are content collections; everything else is here.
 */

export const opening = {
  headline: 'Agents can build what your people need. We give them somewhere safe to build it.',
  lede: 'We’re five senior engineers and consultants who have put AI to work inside some of the UK’s largest organisations. Now we give your people agents that do real work on real systems, in your own cloud account, with your data stored in the EU if you need it.',
  action: 'Talk to us',
} as const;

export const story = {
  question: 'Why you?',
  heading: 'Our story',
  paragraphs: [
    'We met building data, analytics and AI platforms for HMRC. We became friends before business partners, and two of us had already built an agency together.',
    'We made language models available safely and cut the time to start using AI from months to hours. Then we built the tools people asked for.',
    'None was as useful as an agent let loose on the problem. But most people have no terminal, a mistake can reach a lot of systems, and agents isolated in a browser couldn’t share their work or keep it running.',
    'Cloudflare OS closes those gaps, so it’s what we build on.',
  ],
} as const;

export const howWeWork = {
  question: 'How would this work for us?',
  heading: 'How we work with you',
  steps: [
    {
      term: 'Start.',
      text: 'A fixed-scope first deployment: Cloudflare OS in your own account, connected to your sign-in and the systems that matter, with the first agents and apps your teams asked for.',
    },
    {
      term: 'Run.',
      text: 'Support across the whole stack as models and teams change: apps, data, platform, connected services and training.',
    },
    {
      term: 'Grow.',
      text: 'We deliver on our own or with partner consultancies when you need a bigger team.',
    },
  ],
  product:
    'Everything we deliver builds your platform: connectors to the systems you already use, ready-made blueprints and ongoing support, on top of Cloudflare OS.',
} as const;

// Claims checked against Cloudflare's docs and the Cloudflare OS launch post on 28 October 2026
// (see the round 2 report). "Not used" for training and "Take everything with you" are our own
// policy promises and need the founders' agreement.
export const trust = {
  question: 'Where does our data go?',
  heading: 'Sovereign, protected and secure',
  inset: 'Your agents run in your own Cloudflare account and start with access to nothing.',
  rows: [
    { key: 'Where it runs', value: 'Your own Cloudflare account, on Cloudflare OS, which is open source' },
    { key: 'Where data is stored', value: 'An EU jurisdiction when you need it' },
    { key: 'Models', value: 'You choose; every call goes through AI Gateway' },
    { key: 'Training on your data', value: 'Not used' },
    { key: 'Access', value: 'Granted per resource. Credentials never reach agents, and every request is attributed and logged' },
    { key: 'Data protection', value: 'Built for UK and EU GDPR. We help with your DPIA' },
    { key: 'Leaving', value: 'Take everything with you' },
  ],
} as const;

export const team = {
  question: 'Who are you?',
  heading: 'The team',
} as const;

// The providers named here come from models.yaml.
export const models = {
  question: 'Which models?',
  heading: 'You choose the models',
  before: 'Bring your own provider and key, run your own models on-premises or in your cloud, or use',
  after:
    'Every call goes through one gateway, so access, spend and audit work the same whichever you choose.',
} as const;

export const sponsorship = {
  question: 'Could this help a community?',
  heading: 'Simple enough for a volunteer. Contained enough for a classroom.',
  body: 'Fund AI for a code club, school or charity and we’ll set them up. It runs in a browser, and they sign in with accounts they already have. Nothing reaches the internet or any data unless an organiser allows it, and spending stops at your budget. Your people can volunteer as mentors. You get a short report of what was made and the learning hours delivered.',
  ask: 'We’re looking for our first two sponsors.',
  action: 'Talk to us',
} as const;

export const contact = {
  question: 'How do we start?',
  heading: 'Talk to us',
  body: 'If you’re putting agents to work in your organisation, or would like to build with us, we’d like to hear from you.',
} as const;
