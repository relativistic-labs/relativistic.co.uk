/**
 * Page copy. Review drafts, not approved copy (build brief, 28 October 2026).
 * Used by the HTML components and by /index.md, so both say the same thing.
 * Founders and models are content collections; everything else is here.
 */

export const opening = {
  // Content plan review, change 1, option A.
  headline: 'Agents can build what your people need. We give them somewhere safe to run it.',
  // Content plan review, change 1, supporting line.
  lede:
    "We're five senior engineers and consultants who have put AI to work inside some of the UK's largest organisations. Now we help organisations give their people agents that can do real work on real systems, and we're building a product from what we learn.",
  action: 'Talk to us',
} as const;

// Content plan review, change 2, with "Two of us had already built an agency together."
export const story = {
  heading: 'Our story',
  paragraphs: [
    'We met building data, analytics and AI platforms for HMRC, one of the most security-conscious organisations in the country. We became friends before we became business partners. Two of us had already built an agency together.',
    'First we made language models available safely: governance, spend controls, observability, self-service. The time it took a team to start using AI fell from months to hours. Then we built the tools people asked for: workflow builders, synthetic data generators, search across internal knowledge, and presentation builders that tailor content to an audience.',
    'They worked. But none was as useful as letting an agent loose on the problem. The catch was where its code could run. Ordinary infrastructure assumes a developer at a terminal, and a mistake can reach a lot of systems. Most people have neither the access nor the terminal. We isolated agents inside the browser, but then nothing they made could be shared or keep running once the tab closed.',
    "Cloudflare OS closes those gaps. Every agent starts with access to nothing and must be granted each resource it uses. What it builds is a real app, private until it is shared like a document. Work can run on a schedule, without anyone logged in. Whoever opens an agent's work must be allowed to see what the agent saw. And every request is attributed and budgeted.",
  ],
} as const;

// Content plan review, change 3. Product sentence from recommendation (b).
export const howWeWork = {
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
    'Everything we deliver feeds our product: connectors to the systems you already use, ready-made blueprints and ongoing support, on top of Cloudflare OS.',
} as const;

export const team = {
  heading: 'The team',
} as const;

// Content plan review, "Included models" draft. The line-up sentence is built from models.yaml.
export const models = {
  heading: 'Models included',
  intro:
    'Every deployment includes model usage. We choose the models that give the most capability per pound (the price–performance frontier) and test each new release before switching.',
  premium: 'Need a frontier model for a particular job? Add it at cost.',
} as const;

// Content plan review, sponsorship draft.
export const sponsorship = {
  heading: 'Simple enough for a volunteer. Contained enough for a classroom.',
  body: "Fund AI for a code club, school or charity and we'll set them up. It runs in a browser, and they sign in with accounts they already have. Nothing reaches the internet or any data unless an organiser allows it, and spending stops at your budget. Your people can volunteer as mentors. You get a short report of what was made and the learning hours delivered.",
  ask: "We're looking for our first two sponsors.",
  action: 'Talk to us',
} as const;

// Content plan, contact draft.
export const contact = {
  heading: 'Talk to us',
  body: "If you're putting agents to work in your organisation, or would like to build with us, we'd like to hear from you.",
} as const;
