// Placeholder copy for the template wizard: English, plain and generic on purpose. It is there to be replaced (or to be written by the configured AI, which fills
// the same slots). {thing} becomes the market context the person typed ("hotel", "bakery"), or a default noun of the sector; {name} the name of the site.
// Nothing here is a claim about a real business: no numbers, no prices, no years, no promises.

export const SECTORS = ['it', 'food', 'consultant', 'insurance', 'tourism'] as const;
export type Sector = (typeof SECTORS)[number];

export const BLOCK_TYPES = ['hero', 'banner', 'cta', 'box-grid-3', 'box-grid-6', 'form', 'title'] as const;
/** What a snippet of the library can stand for: one of the blocks, or `custom` (a block of its own, with the name its owner gave it). */
export const SNIPPET_BLOCK_TYPES = [...BLOCK_TYPES, 'custom'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface Item { title: string; text: string }

export interface SectorCopy {
  /** the noun {thing} stands for when the person typed no market context */
  thing: string;
  hero: { title: string; lead: string; primary: string; secondary: string; imageAlt: string };
  banner: { message: string; link: string };
  cta: { title: string; line: string; button: string };
  grid3: { title: string; items: [Item, Item, Item] };
  grid6: { title: string; items: [Item, Item, Item, Item, Item, Item] };
  form: { title: string; lead: string; submit: string };
  headerButton: string;
  footerLine: string;
  /** what the wizard proposes as a starting point */
  suggested: { landing: BlockType[]; pages: { title: string; blocks: BlockType[] }[] };
}

const COMMON_FORM_FIELDS = [
  { name: 'name', label: 'Your name', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'message', label: 'Message', type: 'textarea', required: false },
] as const;
export const FORM_FIELDS = COMMON_FORM_FIELDS;

export const COPY: Record<Sector, SectorCopy> = {
  it: {
    thing: 'IT company',
    hero: { title: 'Technology that keeps your business moving', lead: 'We help your {thing} design, build and run reliable systems, so your team can focus on the work that matters.', primary: 'Talk to us', secondary: 'See our services', imageAlt: 'A team reviewing a system dashboard together' },
    banner: { message: 'Not sure where to start? Ask for a first assessment.', link: 'Get in touch' },
    cta: { title: 'Ready to simplify your IT?', line: 'Tell us what is slowing you down and we will suggest a first step.', button: 'Contact us' },
    grid3: { title: 'What we do', items: [
      { title: 'Managed infrastructure', text: 'We monitor, update and secure servers and networks so they stay available.' },
      { title: 'Software development', text: 'Custom applications built with your team, from the first idea to production.' },
      { title: 'Support that answers', text: 'A named team and clear response times when something goes wrong.' }] },
    grid6: { title: 'Everything your systems need', items: [
      { title: 'Cloud and hosting', text: 'Run your applications where it makes sense, with a plan for growth.' },
      { title: 'Cybersecurity', text: 'Sensible protection, regular checks and a plan for when something happens.' },
      { title: 'Backup and recovery', text: 'Copies you can restore, tested before you need them.' },
      { title: 'Integrations', text: 'Connect the tools you already use so data is entered once.' },
      { title: 'Training', text: 'Short, practical sessions so people use their tools with confidence.' },
      { title: 'Consulting', text: 'An outside view on your systems, your costs and your options.' }] },
    form: { title: 'Tell us about your project', lead: 'Write a few lines and we will reply as soon as we can.', submit: 'Send message' },
    headerButton: 'Contact us',
    footerLine: 'Technology, explained and delivered.',
    suggested: { landing: ['hero', 'box-grid-3', 'banner', 'box-grid-6', 'cta'], pages: [{ title: 'About', blocks: ['hero', 'box-grid-3', 'cta'] }, { title: 'Services', blocks: ['hero', 'box-grid-6', 'cta'] }, { title: 'Contact', blocks: ['hero', 'form'] }] },
  },
  food: {
    thing: 'restaurant',
    hero: { title: 'Good food, made with care', lead: 'Welcome to our {thing}: simple dishes, honest ingredients and a table waiting for you.', primary: 'Reserve a table', secondary: 'See the menu', imageAlt: 'A table set with fresh dishes' },
    banner: { message: 'Planning a special evening? Tell us about it.', link: 'Write to us' },
    cta: { title: 'Come and sit down', line: 'Whether it is lunch, dinner or a celebration, we would love to host you.', button: 'Book now' },
    grid3: { title: 'What we serve', items: [
      { title: 'Starters', text: 'Light things to share while you decide what comes next.' },
      { title: 'Main dishes', text: 'Seasonal plates cooked to order from ingredients we trust.' },
      { title: 'Desserts', text: 'A short list of sweet endings, made in house.' }] },
    grid6: { title: 'Why people come back', items: [
      { title: 'Fresh ingredients', text: 'We cook with what is good this week.' },
      { title: 'Made in house', text: 'Bread, sauces and desserts are prepared in our kitchen.' },
      { title: 'Seasonal menu', text: 'The menu changes when the market does.' },
      { title: 'Private events', text: 'Space for birthdays, meetings and celebrations.' },
      { title: 'Dietary needs', text: 'Tell us what you cannot eat and we will take care of it.' },
      { title: 'Takeaway', text: 'Enjoy our dishes at home, packed with care.' }] },
    form: { title: 'Reserve or ask us anything', lead: 'Leave your details and your request, and we will get back to you.', submit: 'Send request' },
    headerButton: 'Reserve',
    footerLine: 'Good food, good company.',
    suggested: { landing: ['hero', 'box-grid-3', 'banner', 'box-grid-6', 'cta'], pages: [{ title: 'Menu', blocks: ['hero', 'box-grid-6', 'cta'] }, { title: 'About', blocks: ['hero', 'box-grid-3'] }, { title: 'Contact', blocks: ['hero', 'form'] }] },
  },
  consultant: {
    thing: 'consulting firm',
    hero: { title: 'Clear advice for the decisions that matter', lead: 'We work with each client of our {thing} to understand the problem first, then agree a practical way forward.', primary: 'Book a first call', secondary: 'How we work', imageAlt: 'Two colleagues discussing a plan at a table' },
    banner: { message: 'A first conversation costs you nothing but your time.', link: 'Contact us' },
    cta: { title: 'Let us talk about your situation', line: 'Describe what you are facing and we will tell you honestly how we can help.', button: 'Get in touch' },
    grid3: { title: 'How we help', items: [
      { title: 'Understand', text: 'We listen, ask questions and look at the facts before proposing anything.' },
      { title: 'Plan', text: 'A clear plan with steps, owners and a way to tell whether it works.' },
      { title: 'Support', text: 'We stay beside your team while the plan becomes everyday practice.' }] },
    grid6: { title: 'Areas of work', items: [
      { title: 'Strategy', text: 'Choose a direction and the priorities that follow from it.' },
      { title: 'Operations', text: 'Make everyday work simpler, faster and less error-prone.' },
      { title: 'Finance', text: 'Understand your numbers and plan with them.' },
      { title: 'People and teams', text: 'Roles, communication and ways of working that last.' },
      { title: 'Change', text: 'Introduce new ways of working without losing people on the way.' },
      { title: 'Training', text: 'Workshops tailored to your team and your questions.' }] },
    form: { title: 'Start a conversation', lead: 'Tell us a little about your situation and we will reply personally.', submit: 'Send message' },
    headerButton: 'Book a call',
    footerLine: 'Independent advice, practical results.',
    suggested: { landing: ['hero', 'box-grid-3', 'banner', 'box-grid-6', 'cta'], pages: [{ title: 'About', blocks: ['hero', 'box-grid-3'] }, { title: 'Services', blocks: ['hero', 'box-grid-6', 'cta'] }, { title: 'Contact', blocks: ['hero', 'form'] }] },
  },
  insurance: {
    thing: 'insurance agency',
    hero: { title: 'Protection that fits your life', lead: 'At our {thing} we take the time to explain your options in plain words, so you choose cover you understand.', primary: 'Ask for advice', secondary: 'See our cover', imageAlt: 'An adviser explaining a policy to a family' },
    banner: { message: 'Review your cover once a year: ask us for a check-up.', link: 'Request one' },
    cta: { title: 'Not sure what you need?', line: 'Tell us about your situation and we will suggest where to start, without obligation.', button: 'Talk to an adviser' },
    grid3: { title: 'Cover for what matters', items: [
      { title: 'Home and family', text: 'Protection for your home, your belongings and the people who live there.' },
      { title: 'Car and travel', text: 'Cover for the road and for the trips you take.' },
      { title: 'Business', text: 'Insurance that follows the way your business really works.' }] },
    grid6: { title: 'What we can look at together', items: [
      { title: 'Health', text: 'Understand what is covered and what is not.' },
      { title: 'Life', text: 'Protect the people who depend on you.' },
      { title: 'Property', text: 'Cover for buildings and what they contain.' },
      { title: 'Liability', text: 'Protection if something goes wrong for someone else.' },
      { title: 'Savings and pensions', text: 'Plan for later with options explained clearly.' },
      { title: 'Claims help', text: 'Guidance and a person to call when you need to make a claim.' }] },
    form: { title: 'Request advice', lead: 'Leave your details and what you would like to protect, and an adviser will contact you.', submit: 'Send request' },
    headerButton: 'Get advice',
    footerLine: 'Clear advice, careful protection.',
    suggested: { landing: ['hero', 'box-grid-3', 'banner', 'box-grid-6', 'cta'], pages: [{ title: 'About', blocks: ['hero', 'box-grid-3'] }, { title: 'Cover', blocks: ['hero', 'box-grid-6', 'cta'] }, { title: 'Contact', blocks: ['hero', 'form'] }] },
  },
  tourism: {
    thing: 'hotel',
    hero: { title: 'A place to rest, a place to explore', lead: 'Welcome to our {thing}: comfortable stays, local knowledge and people who are happy to help you enjoy your trip.', primary: 'Check availability', secondary: 'Discover the area', imageAlt: 'A bright room with a view over the surroundings' },
    banner: { message: 'Planning a stay? Write to us and we will help you choose.', link: 'Ask us' },
    cta: { title: 'Plan your stay with us', line: 'Tell us when you would like to come and what you enjoy, and we will do the rest.', button: 'Contact us' },
    grid3: { title: 'Your stay', items: [
      { title: 'Rooms', text: 'Comfortable rooms, quiet and carefully kept.' },
      { title: 'Breakfast', text: 'A good start to the day, served when you wake up.' },
      { title: 'Local advice', text: 'Our favourite places to eat, walk and visit, shared with guests.' }] },
    grid6: { title: 'What you will find', items: [
      { title: 'A warm welcome', text: 'Someone to greet you and answer your questions.' },
      { title: 'Good beds', text: 'Rest well, so you can enjoy the days.' },
      { title: 'Great location', text: 'Close to what you came to see.' },
      { title: 'Family friendly', text: 'Space and attention for guests of every age.' },
      { title: 'Free wifi', text: 'Stay connected when you need to.' },
      { title: 'Help with plans', text: 'Tips, bookings and directions for your trip.' }] },
    form: { title: 'Ask about your stay', lead: 'Tell us your dates and your questions and we will reply as soon as we can.', submit: 'Send request' },
    headerButton: 'Book your stay',
    footerLine: 'Travel well, stay well.',
    suggested: { landing: ['hero', 'box-grid-3', 'banner', 'box-grid-6', 'cta'], pages: [{ title: 'Rooms', blocks: ['hero', 'box-grid-3', 'cta'] }, { title: 'The area', blocks: ['hero', 'box-grid-6'] }, { title: 'Contact', blocks: ['hero', 'form'] }] },
  },
};

/** The market context a person typed, made safe to put in a sentence: no markup or braces, trimmed, a few words. */
export function cleanContext(raw: string | undefined): string {
  return (raw ?? '').replace(/[<>{}\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
}

export function fill(template: string, vars: { thing: string; name: string }): string {
  return template.replace(/\{thing\}/g, vars.thing).replace(/\{name\}/g, vars.name);
}
