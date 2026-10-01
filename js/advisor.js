/* ==========================================================================
   Corner Market – Business Advisor
   --------------------------------------------------------------------------
   1. Reads the business's current state (profile, prices, promotions, views,
      contacts, account age) and finds the biggest bottleneck.
   2. Builds a personalised, ordered growth roadmap and walks the owner through
      it one step at a time ("start", "next", "done", "step 6", "plan").
   3. Answers everyday questions (pricing, promotions, photos, money habits…).
 
   To use a real AI model instead, run a small server that calls your model
   provider (keep the API key on the server, never in this file) and put its
   URL below. The page will POST:
     { message, history: [{role, text}], business: { name, category, description,
       offerings, promotions, profileStrength, growthStage } }
   and expects back:  { reply: "text" }
   If the request fails, the built-in advisor answers instead.
   ========================================================================== */
const Advisor = (() => {
  const CONFIG = { aiEndpoint: '' };
 
  const chips = [
    'Build my growth plan',
    'Where am I stuck?',
    'Check my profile',
    'Promotion ideas',
    'How should I price my items?',
    'Tips for my type of business'
  ];
 
  const money = p => CM.formatPrice(p);
  const has = (t, words) => words.some(w => t.includes(w));
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const catLabel = biz => CM.catById(biz.category).label.toLowerCase();
  const bullets = arr => arr.map(x => '• ' + x).join('\n');
  const numbered = arr => arr.map((x, i) => `${i + 1}. ${x}`).join('\n');
  const hasActivePromo = b => (b.promotions || []).some(p => !p.expires || p.expires >= CM.today());
 
  /* ---------- Category playbooks ---------- */
  const CAT = {
    food: {
      photo: 'a close-up of your best-selling plate in daylight, plus one wide shot of your stand so people can recognise it',
      hook: 'Made fresh every day.',
      promo: { title: 'Weekday lunch combo', when: 'weekdays 12:00 to 14:00' },
      groups: ['office or taxi-rank WhatsApp groups nearby', 'school parent groups', 'church or community groups'],
      reward: 'a free drink or small side',
      loyalty: 'Buy 5 plates, get the 6th at half price.',
      grow: 'Take lunch-box orders for nearby workplaces, schools and building sites. Ten regular pre-orders a day are steadier than walk-ins, and you cook to order with less waste.',
      timing: 'just before lunch (11:00 to 11:45) and around 16:00 to 17:30, when people decide what to eat'
    },
    clothing: {
      photo: 'your three best pieces laid flat or on a hanger against a plain wall, one photo each',
      hook: 'New stock every Friday.',
      promo: { title: 'Buy 2, save', when: 'this week' },
      groups: ['neighbourhood buy-and-sell groups', 'school and church groups', 'local Facebook community pages'],
      reward: 'R10 off the next purchase',
      loyalty: 'On the 5th purchase, take R20 off.',
      grow: 'Take pre-orders and custom sizes, and offer alterations. Customers who order in advance pay before you buy stock, which protects your cash.',
      timing: 'Thursday evening (before the weekend) and payday weekends'
    },
    groceries: {
      photo: 'your shelves or display, tidy and full, with prices visible',
      hook: 'Open early and late.',
      promo: { title: 'Family pack', when: 'this week' },
      groups: ['street and block WhatsApp groups', 'stokvel and burial-society groups', 'church groups'],
      reward: 'a free small item',
      loyalty: 'Give a small free item on every R200 spent in a week (stamp the card at each visit).',
      grow: 'Deliver to neighbours who cannot walk far, and stock high-traffic services such as airtime, electricity and gas. They bring people in every day.',
      timing: 'early morning (05:30 to 07:00) and after work (16:00 to 18:00)'
    },
    beauty: {
      photo: 'a finished style from the front and the side, with good light (ask the client first)',
      hook: 'Book on WhatsApp.',
      promo: { title: 'Bring a friend', when: 'this month' },
      groups: ['salon and hair-care Facebook groups', 'church and school parent groups', 'neighbourhood WhatsApp groups'],
      reward: 'R30 off the next visit',
      loyalty: 'Give R30 off on the 5th visit.',
      grow: 'Move to fixed appointment slots, take a small deposit on long styles to stop no-shows, and add a home-visit service for busy clients.',
      timing: 'Wednesday and Thursday evenings (people book for the weekend)'
    },
    repairs: {
      photo: 'a before-and-after of a repair, or you at work with your tools laid out neatly',
      hook: 'Warranty on every repair.',
      promo: { title: 'Free diagnosis', when: 'this week' },
      groups: ['neighbourhood WhatsApp groups', 'local buy-and-sell groups', 'workplace groups'],
      reward: 'a discount on the next repair',
      loyalty: 'Do a free check-up after every 3rd job.',
      grow: 'Sign up small businesses (spaza shops, salons, offices) for regular maintenance. One repeat business client is worth many one-off jobs.',
      timing: 'Monday morning and lunchtime, when people notice broken things'
    },
    home: {
      photo: 'the same room before and after cleaning, taken from the same angle',
      hook: 'Supplies included.',
      promo: { title: 'First clean discount', when: 'on the first booking' },
      groups: ['neighbourhood WhatsApp groups', 'complex and estate groups', 'church groups'],
      reward: 'a free extra room',
      loyalty: 'Take 10% off every 5th clean.',
      grow: 'Move from once-off jobs to weekly plans and small offices. Recurring bookings make your income predictable.',
      timing: 'Thursday and Friday (people plan weekend cleaning)'
    },
    other: {
      photo: 'you or your work at its best, in daylight, with a tidy background',
      hook: 'Friendly, reliable service.',
      promo: { title: 'First-time customer offer', when: 'this week' },
      groups: ['neighbourhood WhatsApp groups', 'local buy-and-sell groups', 'community Facebook pages'],
      reward: 'a small discount on the next visit',
      loyalty: 'Give a small reward on the 5th purchase.',
      grow: 'Find the one customer type who buys most often from you and build a simple package just for them.',
      timing: 'early evening, when most people check their phones'
    }
  };
 
  const CAT_TIPS = {
    food: [
      'Put your best seller first and photograph it in daylight. People choose food with their eyes.',
      'Create a weekday lunch combo (meal plus drink at one price). Workers and learners love a fixed, fair price.',
      'Say when you are freshest, for example "hot vetkoek from 06:30", so people know the best time to come.',
      'Keep your stand visibly clean and show any health certificate you hold. It builds trust quickly.'
    ],
    clothing: [
      'Show your 3 to 5 best pieces with clear photos and prices. Customers browse first, then walk over.',
      'Offer bundles ("buy 2, save R20") to raise what each customer spends.',
      'Announce new-stock days ("new stock every Friday") so people have a reason to come back.',
      'Say whether you do alterations, orders or custom sizes. That is a big reason people choose you over a shop.'
    ],
    groceries: [
      'List the items people ask for most (airtime, bread, milk, gas). Customers search by need.',
      'Sell small pack sizes and bundles that suit tight budgets.',
      'Offer WhatsApp orders and delivery to neighbours who cannot walk far. It builds loyalty fast.',
      'Track your fast movers and never run out of them. A missed sale costs more than slow stock.'
    ],
    beauty: [
      'Before and after photos (with permission) are your best advertising.',
      'List every style with a price range and how long it takes, so customers can plan.',
      'Take bookings on WhatsApp and offer a "bring a friend" discount to fill quiet slots.',
      'Say that your tools are cleaned between clients. Hygiene is a top reason people switch salons.'
    ],
    repairs: [
      'List exactly what you fix and typical prices, for example "screen replacement from R350".',
      'Offer a short warranty, even 7 days. It shows you stand behind your work.',
      'Ask happy customers to recommend you in local WhatsApp and Facebook community groups.',
      'Offer same-day or call-out service if you can. Urgency is what people pay for.'
    ],
    home: [
      'Sell packages (once-off, weekly, monthly) with a clear price per room or per hour.',
      'Ask regular clients for a short testimonial and paste it into your description.',
      'Give first-time customers a small discount, then offer a weekly plan.',
      'State what is included (supplies? equipment?) so there are no disagreements on the day.'
    ],
    other: [
      'Describe in one sentence who you help and what problem you solve.',
      'List your services with starting prices so customers know what to expect.',
      'Ask every new customer how they found you and do more of what works.',
      'Give people one easy way to reach you, ideally WhatsApp.'
    ]
  };
 
  /* ---------- Profile strength (also used by the Overview tab) ---------- */
  function strength(biz) {
    const checks = [
      { key: 'location', pts: 20, ok: biz.lat != null && biz.lng != null,
        label: 'Set your location', tip: 'Without a location, customers nearby cannot find you. Use "Find address on map" in the Profile tab.' },
      { key: 'description', pts: 15, ok: (biz.description || '').trim().length >= 60,
        label: 'Write a fuller description', tip: 'Use 2 or 3 sentences: what you sell, what makes you different, and when you are best visited.' },
      { key: 'photo', pts: 15, ok: !!biz.image,
        label: 'Add a photo', tip: 'Profiles with a photo get noticed first. A bright picture of your stand or best product works well.' },
      { key: 'contact', pts: 15, ok: !!(biz.phone || biz.whatsapp),
        label: 'Add a phone or WhatsApp number', tip: 'Make it one tap for customers to call or message you.' },
      { key: 'offerings', pts: 15, ok: (biz.offerings || []).length >= 3,
        label: 'List at least 3 products or services', tip: 'Add names and prices in the Products tab. People skip businesses that hide prices.' },
      { key: 'hours', pts: 10, ok: !!(biz.hours || '').trim(),
        label: 'Add your opening hours', tip: 'Customers do not return after finding you closed. Say when you are open.' },
      { key: 'promo', pts: 10, ok: hasActivePromo(biz),
        label: 'Publish a promotion', tip: 'A simple offer in the Promotions tab makes your listing stand out to nearby customers.' }
    ];
    return {
      score: checks.reduce((s, c) => s + (c.ok ? c.pts : 0), 0),
      missing: checks.filter(c => !c.ok).sort((a, b) => b.pts - a.pts)
    };
  }
 
  /* ==========================================================================
     Growth engine
     ========================================================================== */
 
  /* ---------- 1. Analyse the business's current state ---------- */
  function analyse(biz) {
    const views = biz.stats?.views || 0;
    const contacts = biz.stats?.contacts || 0;
    const rate = views ? contacts / views : null;
    const ageDays = biz.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(biz.createdAt)) / 86400000)) : 0;
    const offers = biz.offerings || [];
    const priced = offers
      .filter(o => o.price !== '' && o.price != null && isFinite(o.price))
      .map(o => ({ name: o.name, price: +o.price }));
    const prices = priced.map(p => p.price);
    const located = biz.lat != null && biz.lng != null;
    const active = CM.activePromos(biz);
    const expired = (biz.promotions || []).filter(p => p.expires && p.expires < CM.today());
    const s = strength(biz);
 
    let stage;
    if (!located) stage = 'hidden';
    else if (views < 10) stage = ageDays < 7 || s.score < 80 ? 'launch' : 'visibility';
    else if (rate !== null && rate < 0.1) stage = 'conversion';
    else stage = 'growth';
 
    return {
      views, contacts, rate, ageDays, offers, priced,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      avg: prices.length ? prices.reduce((x, y) => x + y, 0) / prices.length : null,
      located, active, expired, featured: !!biz.featured, strength: s, stage
    };
  }
 
  const STAGES = {
    hidden: {
      title: 'Nobody can find you yet',
      text: 'You have no location, so you appear in no customer search. Nothing else will help until you are on the map, so that comes first.'
    },
    launch: {
      title: 'The listing is not ready to impress yet',
      text: 'You are visible, but the listing still has gaps and few people have seen it. Sending people to a half-finished profile wastes the first impression, so polish it first, then push traffic.'
    },
    visibility: {
      title: 'The listing is fine, but too few people see it',
      text: 'The profile is in decent shape, yet views are low. The problem is awareness, not quality. Your priority is getting the listing in front of more people nearby.'
    },
    conversion: {
      title: 'People look, but few reach out',
      text: 'You are getting views, but fewer than about 1 in 10 lead to a call, chat or directions request (a rough rule of thumb). Something on the listing is not convincing people: usually the photo, missing prices, or no reason to act now.'
    },
    growth: {
      title: 'The listing works, so it is time to build repeat business',
      text: 'Views are turning into contacts. The biggest gains now come from customers who return, bring friends, and buy more each visit.'
    }
  };
 
  /* Which steps to do first for each bottleneck */
  const PRIORITY = {
    hidden: ['location', 'contact', 'hours', 'photo', 'description'],
    launch: ['photo', 'description', 'catalogue', 'hours', 'contact', 'promo', 'share'],
    visibility: ['featured', 'promo', 'share', 'referrals', 'rhythm', 'bundle'],
    conversion: ['photo', 'description', 'catalogue', 'bundle', 'promo', 'respond', 'tune'],
    growth: ['loyalty', 'referrals', 'records', 'expand', 'rhythm']
  };
 
  const PHASES = [
    'Get found',
    'Make your offer irresistible',
    'Bring people in',
    'Turn views into customers',
    'Keep them and grow'
  ];
 
  /* ---------- 2. Build the personalised steps ---------- */
  function comboIdea(a) {
    if (a.priced.length < 2) return null;
    const [x, y] = a.priced;
    const sum = x.price + y.price;
    let price = Math.round(sum * 0.9 / 5) * 5;
    if (price >= sum || price <= Math.max(x.price, y.price)) price = Math.round(sum * 0.9);
    return { x, y, sum, price };
  }
 
  function buildSteps(biz, a) {
    const c = CAT[biz.category] || CAT.other;
    const label = catLabel(biz);
    const combo = comboIdea(a);
    const S = [];
    const add = s => S.push(s);
 
    /* ---- Phase 1: Get found ---- */
    add({ id: 'location', phase: 0, title: 'Put your business on the map', auto: true, ok: a.located,
      now: a.located ? 'Your location is saved.' : 'No location is set, so you appear in no customer search.',
      why: 'Customers see the closest businesses first. Without a location you are invisible, however good the rest of your profile is.',
      actions: [
        'Open the **Profile and address** tab.',
        'Fill in your suburb or township and your town or city. Add a street or landmark such as "next to the taxi rank".',
        'Tap **Find address on map**. If the result looks wrong, or you have no street address, stand at your stall and tap **Use my current position** instead.',
        'Tap **Save profile**, then **See what customers see** and check that you appear.'
      ],
      measure: 'You show up in the customer search when you search from your own spot.' });
 
    add({ id: 'contact', phase: 0, title: 'Make it one tap to reach you', auto: true, ok: !!(biz.phone || biz.whatsapp),
      now: (biz.phone || biz.whatsapp) ? `Contact details are saved (${biz.whatsapp ? 'WhatsApp' : 'phone'}).` : 'No phone or WhatsApp number yet.',
      why: 'Most customers decide in seconds. If contacting you takes effort, they move on to the next listing.',
      actions: [
        'In **Profile and address**, add your phone number and a WhatsApp number (they can be the same).',
        'Decide who answers and when. Keep the phone on and within reach during your opening hours.',
        'Save three quick replies in your phone notes: your price list, directions to your stand ("next to..."), and your opening hours. Copy and paste them so you reply in seconds.'
      ],
      measure: '**Calls, chats and directions** on your Overview tab starts to rise.' });
 
    add({ id: 'hours', phase: 0, title: 'Publish your opening hours', auto: true, ok: !!(biz.hours || '').trim(),
      now: biz.hours ? `Your hours are set: ${biz.hours}.` : 'No opening hours are listed.',
      why: 'A customer who arrives and finds you closed rarely tries again. Clear hours turn a maybe into a visit.',
      actions: [
        'In **Profile and address**, type your hours in a short format such as "Mon to Sat, 07:00 to 18:00".',
        'If your hours change on some days, say so in your description.',
        'Keep to them for the next two weeks. Reliability is what turns first-timers into regulars.'
      ],
      measure: 'Nobody arrives to a closed stand.' });
 
    add({ id: 'photo', phase: 0, title: 'Add a strong photo', auto: true, ok: !!biz.image,
      now: biz.image ? 'A photo is uploaded.' : 'No photo yet, so your card shows a plain coloured tile.',
      why: 'The photo is the first thing customers see on your card. Listings with a real photo look trustworthy and get opened more.',
      actions: [
        `Take ${c.photo}.`,
        'Use daylight (outside or by a window), wipe your phone lens first, and do not use flash.',
        'In **Profile and address**, tap **Choose a photo**, then **Save profile**.',
        'Replace it every month, or when you have new stock, so returning visitors see something fresh.'
      ],
      measure: 'Your photo shows on your card in the customer search, and views turn into contacts more often.' });
 
    const len = (biz.description || '').trim().length;
    const items = a.offers.slice(0, 3).map(o => o.name);
    const draft = `${biz.name} is a ${label} business${biz.address?.suburb ? ' in ' + biz.address.suburb : ''}. We sell ${items.length ? items.join(', ') : '[your 2 or 3 main items]'}. ${biz.hours ? 'Open ' + biz.hours + '. ' : ''}${c.hook}`;
    add({ id: 'description', phase: 0, title: 'Write a description that sells', auto: true, ok: len >= 60,
      now: len ? `Your description is ${len} characters. Aim for 120 to 250.` : 'You have not written a description yet.',
      why: 'The description answers the customer\'s silent question: "why should I choose you?". A specific description beats a generic one every time.',
      actions: [
        'Cover five things in 2 to 4 sentences: what you sell, who it is for, what makes you different, when you are open, and how to order.',
        `Here is a draft built from your profile. Edit it into your own words: "${draft}"`,
        'Paste it into **Description** in **Profile and address** and save.'
      ],
      measure: 'A customer could describe your business to a friend after reading it.' });
 
    /* ---- Phase 2: Make your offer irresistible ---- */
    const n = a.offers.length, m = a.priced.length;
    let spread = 'Aim for a mix: one cheap "easy yes" item, one best seller, and one premium or bigger option.';
    if (m >= 3 && a.max / a.min < 1.3) {
      spread = `Your prices are all close together (${money(a.min)} to ${money(a.max)}). Add a cheaper "easy yes" item and a premium option so there is something for every budget.`;
    } else if (m >= 2) {
      spread = `Your range runs from ${money(a.min)} to ${money(a.max)}. Make sure the cheapest is an easy first purchase and the dearest is a worthwhile upgrade.`;
    }
    add({ id: 'catalogue', phase: 1, title: 'Build a complete, priced product list', auto: true, ok: n >= 5 && m === n,
      now: n
        ? `${n} item${n === 1 ? '' : 's'} listed, ${m} with prices${m ? ` (from ${money(a.min)} to ${money(a.max)}, average ${money(a.avg)})` : ''}.`
        : 'Nothing is listed yet.',
      why: 'People skip businesses that hide prices or list only one thing. A clear list lets customers decide before they contact you.',
      actions: [
        'Open the **Products** tab and add items until you have 5 to 8. List what people ask for most, and ask your next three customers what they look for that you do not list.',
        n > m ? `Add a price to the ${n - m} item${n - m === 1 ? '' : 's'} without one.` : 'Keep every item priced.',
        'Use the words customers use (say "kota", not "sandwich").',
        spread
      ],
      measure: 'Fewer customers asking "how much?" and more contacts per view.' });
 
    const hasBundle = a.offers.some(o => /combo|bundle|pack|deal|special|package|plan\b/i.test(o.name));
    add({ id: 'bundle', phase: 1, title: 'Create a combo or bundle', auto: true, ok: hasBundle,
      now: hasBundle ? 'You already list a combo or bundle.' : 'No combo or bundle is listed.',
      why: 'Bundles raise what each customer spends without starting a price war, and they give people one simple thing to say yes to.',
      actions: combo ? [
        `Your first two items, ${combo.x.name} (${money(combo.x.price)}) and ${combo.y.name} (${money(combo.y.price)}), cost ${money(combo.sum)} separately. Offer both for about ${money(combo.price)}, roughly 10% off.`,
        'Check the maths first: the bundle price must still cover the cost of both items plus a profit for you. If it does not, add a small extra instead of cutting the price.',
        `Add it in **Products** with a clear name, for example "${combo.x.name} + ${combo.y.name} combo".`,
        'Mention it to every customer at the point of sale.'
      ] : [
        'Pick two items that customers often buy together.',
        'Price the pair about 10% below the total, but check it still leaves you a profit after your costs.',
        'Add it in **Products** with a clear name, such as "Item A + Item B combo".',
        'Mention it to every customer at the point of sale.'
      ],
      measure: 'More sales include two or more items, and a typical day\'s takings go up.' });
 
    let promoText;
    if (combo) promoText = `${combo.x.name} + ${combo.y.name} for ${money(combo.price)} (normally ${money(combo.sum)}), ${c.promo.when}.`;
    else promoText = `Visit us ${c.promo.when} and get ${c.reward}.`;
    add({ id: 'promo', phase: 1, title: 'Run a promotion with a deadline', auto: true, ok: a.active.length > 0,
      now: a.active.length
        ? `${a.active.length} promotion${a.active.length === 1 ? ' is' : 's are'} running.`
        : (a.expired.length ? `Your last promotion ended on ${a.expired[0].expires}. Nothing is running now.` : 'You have not published a promotion yet.'),
      why: 'A time-limited offer gives undecided customers a reason to act now, and it makes your card stand out in a list of similar businesses.',
      actions: [
        'Open the **Promotions** tab.',
        `Publish this: title **${c.promo.title}**, details "${promoText}"`,
        'Set an end date 7 to 14 days ahead. The deadline creates urgency, and expired promotions disappear automatically so your listing never looks stale. Publish a fresh one when it ends.',
        'Write the offer on a piece of cardboard at your stand.',
        'Keep a tally of how many customers mention it. That is your test result.'
      ],
      measure: 'Customers mention the offer, and contacts per view go up while it runs.' });
 
    add({ id: 'featured', phase: 1, title: 'Turn on your Featured listing', auto: true, ok: a.featured,
      now: a.featured ? 'Featured is on.' : 'Featured is off.',
      why: 'Featured businesses appear first in nearby results and carry a badge. When views are the problem, this is the quickest lever you have inside the app.',
      actions: [
        'Open the **Promotions** tab.',
        'Switch on **Feature my business**.',
        'Only do this once your photo, prices and description are in place, so the extra views land on a strong listing.'
      ],
      measure: 'Your **Profile views** on the Overview tab go up within a few days.' });
 
    /* ---- Phase 3: Bring people in ---- */
    add({ id: 'share', phase: 2, title: 'Share your listing in three local groups', auto: false,
      now: `You have ${a.views} profile view${a.views === 1 ? '' : 's'} so far.`,
      why: 'Local WhatsApp and Facebook groups are free, and the people in them live near you. A recommendation from a neighbour is more powerful than any advert.',
      actions: [
        'Open the **Overview** tab, look at **Tell people you\'re here**, and tap **Copy message**.',
        `Choose three groups. Good options: ${c.groups.join('; ')}.`,
        'Ask the group admin first. Many groups ban adverts, and being removed hurts your name.',
        `Post at a busy time: ${c.timing}.`,
        'Reply to every comment and question within the hour.',
        `Check your Overview after 48 hours. A good first target is ${a.views + 15} profile views.`
      ],
      measure: `Profile views rise from ${a.views} to ${a.views + 15} or more within a week.` });
 
    add({ id: 'referrals', phase: 2, title: 'Ask your next 10 customers for one referral each', auto: false,
      now: 'Not started.',
      why: 'Happy customers are your cheapest marketing, but most never think to tell anyone unless you ask.',
      actions: [
        'After a good sale, say: "If you enjoyed that, please send my listing to one friend on WhatsApp. When you both come in, I will give you ' + c.reward + '."',
        'Write "Find us on Corner Market: ' + biz.name + '" on your board or on small cards.',
        'Keep a tally in your notebook: how many asked, how many agreed.',
        'Give the reward immediately when it is earned. Delays kill the habit.'
      ],
      measure: 'At least 3 of the 10 customers send your listing on, and you see new faces mention them.' });
 
    add({ id: 'rhythm', phase: 2, title: 'Post on WhatsApp Status three times a week', auto: false,
      now: 'Not started.',
      why: 'People who already know you forget you. A steady, small presence keeps you at the front of their minds without spending money.',
      actions: [
        'Set up **WhatsApp Business** (free). Add your address, hours and product catalogue.',
        'Post to Status three times a week: (1) a fresh photo of your best product or new stock, (2) a behind-the-scenes moment or a happy customer (with permission), (3) your current promotion.',
        'Save your contacts (with their permission) and ask people to save your number so they see your Status.',
        'Post at the same times each week so people learn when to look.'
      ],
      measure: 'Customers say "I saw it on your Status" when they arrive.' });
 
    /* ---- Phase 4: Turn views into customers ---- */
    add({ id: 'respond', phase: 3, title: 'Reply to every message within 15 minutes', auto: false,
      now: 'Not started.',
      why: 'A person who messages you is deciding right now. Whoever replies first, and helpfully, usually wins the sale.',
      actions: [
        'During opening hours, check WhatsApp at least every 15 minutes.',
        'Use your saved quick replies (price list, directions, hours) and add a personal line with their name.',
        'End every reply with a question or next step: "What time can you come?" or "Shall I keep one for you?"',
        'Outside opening hours, set an away message in WhatsApp Business that says when you will reply.'
      ],
      measure: 'More of the people who message you actually turn up and buy.' });
 
    const rateText = a.rate === null
      ? 'You have no views recorded yet, so there is nothing to compare.'
      : `You have ${a.views} views and ${a.contacts} contact${a.contacts === 1 ? '' : 's'} (${Math.round(a.rate * 100)}% of views). As a rough guide, 10% to 20% is healthy for a local listing.`;
    add({ id: 'tune', phase: 3, title: 'Use your numbers every Sunday', auto: false,
      now: rateText,
      why: 'Guessing wastes time. Two numbers on your Overview tab tell you exactly what to fix next.',
      actions: [
        'Every Sunday, write down **Profile views** and **Calls, chats and directions** from your Overview tab.',
        'If views are going up but contacts are flat, the listing is the problem. Improve your photo, add missing prices, or make the promotion clearer.',
        'If contacts go up but sales do not, the problem is at your stand or in your replies: speed, stock, price, or friendliness.',
        'If views are flat, go back to sharing and referrals.',
        'Change only one thing per week so you can tell what worked.'
      ],
      measure: 'You always know which single thing to work on this week.' });
 
    /* ---- Phase 5: Keep them and grow ---- */
    add({ id: 'loyalty', phase: 4, title: 'Start a simple loyalty card', auto: false,
      now: 'Not started.',
      why: 'Winning a new customer costs far more than keeping an existing one. A loyalty card gives people a reason to choose you again.',
      actions: [
        `Make a card with 6 boxes. Suggested rule: ${c.loyalty}`,
        'Check the maths: the cost to you of the free reward must be less than the profit you made on the five earlier purchases.',
        'Hand a card to every customer and stamp it there and then.',
        'Write down names and WhatsApp numbers (with permission) so you can tell regulars about new stock or specials.'
      ],
      measure: 'The share of customers who come back within two weeks goes up.' });
 
    add({ id: 'records', phase: 4, title: 'Keep weekly sales and cost records', auto: false,
      now: 'Not started.',
      why: 'You cannot grow what you cannot measure. Records show which items really make money and protect you from running out of cash.',
      actions: [
        'Use a notebook or a phone note. Every day write total sales, and every expense (stock, transport, airtime, electricity).',
        'Every Sunday work out: sales minus costs = profit. Then see which items sold most.',
        'Pay yourself a fixed weekly amount from the profit. Keep the rest for stock and emergencies.',
        'Stock more of your fastest sellers and less of the slow ones.'
      ],
      measure: 'You can say how much profit you made last week and which item earned the most.' });
 
    add({ id: 'expand', phase: 4, title: 'Add one new way to earn', auto: false,
      now: 'Not started.',
      why: 'Once the basics work, growth comes from serving customers in a new way, not from working longer hours.',
      actions: [
        `Best next move for a ${label} business: ${c.grow}`,
        'Only start when: your profile is complete, you have four weeks of records, your core items are profitable, and you get contacts every week.',
        'Test it small for two weeks before you buy extra stock or equipment.',
        'Announce it with a promotion so people notice.'
      ],
      measure: 'The new offer earns money for two weeks in a row before you commit more.' });
 
    S.forEach((s, i) => { s.n = i + 1; });
    return S;
  }
 
  /* ---------- 3. Progress tracking ---------- */
  const progKey = biz => 'cm_plan_' + biz.id;
  const getProgress = biz => CM.store.get(progKey(biz), { manual: [], current: null });
  const saveProgress = (biz, p) => CM.store.set(progKey(biz), p);
 
  function getPlan(biz) {
    const a = analyse(biz);
    const prog = getProgress(biz);
    const steps = buildSteps(biz, a);
    steps.forEach(s => { s.done = s.auto ? s.ok : prog.manual.includes(s.id); });
 
    // recommended order: bottleneck steps first, then the rest in natural order
    const pri = PRIORITY[a.stage] || [];
    const order = [
      ...pri.map(id => steps.find(s => s.id === id)).filter(Boolean),
      ...steps.filter(s => !pri.includes(s.id))
    ];
    return { a, steps, order, prog, doneCount: steps.filter(s => s.done).length };
  }
 
  const nextIncomplete = (plan, afterId) => {
    const pending = plan.order.filter(s => !s.done);
    if (!pending.length) return null;
    if (!afterId) return pending[0];
    const idx = plan.order.findIndex(s => s.id === afterId);
    return plan.order.slice(idx + 1).find(s => !s.done) || pending[0];
  };
 
  /* ---------- 4. Reply builders ---------- */
  function facts(biz, a) {
    const f = [];
    f.push(`**Findable:** ${a.located ? 'yes, you appear in nearby searches.' : 'no. You have no location, so customers cannot find you.'}`);
    if (a.views) {
      f.push(`**Attention:** ${a.views} profile view${a.views === 1 ? '' : 's'} and ${a.contacts} contact${a.contacts === 1 ? '' : 's'} (${Math.round(a.rate * 100)}% of views).`);
    } else {
      f.push(`**Attention:** no profile views recorded yet (${a.ageDays === 0 ? 'you joined today' : `${a.ageDays} day${a.ageDays === 1 ? '' : 's'} since you joined`}).`);
    }
    f.push(`**Profile:** ${a.strength.score}% complete${a.strength.missing.length ? `, ${a.strength.missing.length} thing${a.strength.missing.length === 1 ? '' : 's'} to fix` : ''}.`);
    if (a.offers.length) {
      f.push(`**Products:** ${a.offers.length} listed, ${a.priced.length} priced${a.priced.length ? ` (${money(a.min)} to ${money(a.max)})` : ''}.`);
    } else {
      f.push('**Products:** nothing listed yet.');
    }
    f.push(`**Offer:** ${a.active.length ? `${a.active.length} promotion${a.active.length === 1 ? '' : 's'} running` : 'no promotion running'}, Featured ${a.featured ? 'on' : 'off'}.`);
    return f;
  }
 
  function stepDetail(step, plan) {
    const total = plan.steps.length;
    const lines = [
      `**Step ${step.n} of ${total}: ${step.title}**`,
      `Phase ${step.phase + 1} of ${PHASES.length}: ${PHASES[step.phase]}`,
      '',
      `**Where you are now:** ${step.now}`,
      '',
      `**Why it matters:** ${step.why}`,
      '',
      '**Do this:**',
      numbered(step.actions),
      '',
      `**You will know it worked when:** ${step.measure}`,
      '',
      step.auto
        ? 'Say **done** when you have made the change and I will check it, **next** to move on, or **plan** to see the whole roadmap.'
        : 'Say **done** when you have finished, **next** to move on, or **plan** to see the whole roadmap.'
    ];
    return lines.join('\n');
  }
 
  function planOverview(biz) {
    const plan = getPlan(biz);
    const { a } = plan;
    const st = STAGES[a.stage];
    const first = nextIncomplete(plan, null);
 
    let out = `**Growth plan for ${biz.name}**\n\n`;
    out += `**Where you stand right now**\n${bullets(facts(biz, a))}\n\n`;
    out += `**Your biggest bottleneck:** ${st.title}.\n${st.text}\n\n`;
    out += `**Your roadmap** (${plan.doneCount} of ${plan.steps.length} steps done)\n`;
 
    PHASES.forEach((ph, pi) => {
      out += `\n**Phase ${pi + 1}: ${ph}**\n`;
      out += plan.steps.filter(s => s.phase === pi).map(s => {
        const mark = s.done ? '✓' : (first && s.id === first.id ? '→' : '○');
        return `${mark} ${s.n}. ${s.title}`;
      }).join('\n') + '\n';
    });
 
    if (first) {
      const pri = (PRIORITY[a.stage] || []).map(id => plan.steps.find(s => s.id === id)).filter(s => s && !s.done).slice(0, 3);
      out += `\n**Do these first, because of your bottleneck:** ${pri.map(s => `step ${s.n}`).join(', ') || `step ${first.n}`}.\n`;
      out += `\n**Start with step ${first.n}: ${first.title}.** Say **start** and I will walk you through it. You can also say **next**, **done**, **step 6** or **plan** at any time.`;
      plan.prog.current = null;
      saveProgress(biz, plan.prog);
    } else {
      out += `\nEvery step is done. Keep the habits going: reply fast, refresh your photo and promotion monthly, and review your numbers each Sunday. Say **reset plan** if you want to start the manual steps again.`;
    }
    return out;
  }
 
  function diagnosis(biz) {
    const plan = getPlan(biz);
    const { a } = plan;
    const st = STAGES[a.stage];
    const pending = plan.order.filter(s => !s.done);
    let out = `**Where you are stuck:** ${st.title}.\n${st.text}\n\n**The evidence:**\n${bullets(facts(biz, a))}\n\n`;
    if (pending.length) {
      out += `**What to do about it, in order:**\n${numbered(pending.slice(0, 3).map(s => `Step ${s.n}: ${s.title}`))}\n\nSay **start** to begin with step ${pending[0].n}, or **plan** for the full roadmap.`;
    } else {
      out += 'You have completed every step, so the next gains come from consistency. Keep checking your numbers each Sunday.';
    }
    out += '\n\nNote: view and contact numbers are what this app has recorded so far, so early on they can be small.';
    return out;
  }
 
  function showStep(biz, step, plan) {
    plan.prog.current = step.id;
    saveProgress(biz, plan.prog);
    return stepDetail(step, plan);
  }
 
  /* Handles start / next / done / skip / step N / plan. Returns text or null. */
  function planCommand(input, biz) {
    const t = input.toLowerCase().trim().replace(/[.!?]+$/, '');
    const short = t.length <= 24;
 
    if (/^reset (my )?(plan|progress)\b/.test(t)) {
      saveProgress(biz, { manual: [], current: null });
      return 'Plan progress reset. Steps that I can check from your profile (like location, photo and promotion) will still show as done when they are complete. Say **plan** to see your roadmap.';
    }
 
    const stepMatch = t.match(/\bstep\s*#?(\d{1,2})\b/);
    if (stepMatch && t.length <= 40) {
      const plan = getPlan(biz);
      const step = plan.steps.find(s => s.n === +stepMatch[1]);
      if (!step) return `There are ${plan.steps.length} steps. Say **plan** to see the list.`;
      return showStep(biz, step, plan);
    }
 
    if (short && /^(plan|roadmap|progress|show (me )?(the |my )?plan)$/.test(t)) return planOverview(biz);
 
    if (short && /^(start|begin|let'?s (start|go|begin)|next|next step|continue|what'?s next|whats next|go on)$/.test(t)) {
      const plan = getPlan(biz);
      const step = nextIncomplete(plan, /^(start|begin|let)/.test(t) ? null : plan.prog.current);
      if (!step) return 'You have finished every step. Say **plan** to review the roadmap.';
      return showStep(biz, step, plan);
    }
 
    if (short && /^skip\b/.test(t)) {
      const plan = getPlan(biz);
      const step = nextIncomplete(plan, plan.prog.current);
      return step ? showStep(biz, step, plan) : 'Nothing left to skip to. Say **plan** to review the roadmap.';
    }
 
    if (short && /^(done|finished|completed|complete|i did it|did it|i have done it|all done)$/.test(t)) {
      const plan = getPlan(biz);
      const cur = plan.steps.find(s => s.id === plan.prog.current);
      if (!cur) return 'Say **start** and I will take you to your first step.';
 
      if (cur.auto && !cur.ok) {
        return `I have checked your profile and step ${cur.n} (**${cur.title}**) is not complete yet.\n\n**Still to do:** ${cur.now}\n\nMake the change in the app, then say **done** again. Or say **skip** to come back to it later.`;
      }
      if (!cur.auto && !plan.prog.manual.includes(cur.id)) {
        plan.prog.manual.push(cur.id);
        saveProgress(biz, plan.prog);
        cur.done = true;
        plan.doneCount += 1;
      }
      const nxt = nextIncomplete(getPlan(biz), cur.id);
      const head = `**Step ${cur.n} done.** ${plan.doneCount} of ${plan.steps.length} complete.\n\n`;
      if (!nxt) return head + 'You have finished the whole roadmap. Keep your habits going and review your numbers each Sunday.';
      return head + showStep(biz, nxt, getPlan(biz));
    }
    return null;
  }
 
  /* ---------- Everyday answers ---------- */
  function greeting(biz) {
    const plan = getPlan(biz);
    const st = STAGES[plan.a.stage];
    return `Hi ${biz.ownerName ? biz.ownerName.split(' ')[0] : 'there'}! I'm your business advisor for **${biz.name}**.\n\n` +
      `Your profile is **${plan.a.strength.score}%** complete, and right now your biggest bottleneck is: **${st.title.toLowerCase()}**.\n\n` +
      `I can build you a step-by-step growth plan from your real numbers and walk you through it. Tap **Build my growth plan** below to begin, or ask me anything about pricing, promotions or keeping customers.`;
  }
 
  function localReply(input, biz) {
    const t = input.toLowerCase();
    const s = strength(biz);
    const name = biz.name;
 
    if (/^(hi|hello|hey|howzit|sawubona|molo|dumela)\b/.test(t) && t.length < 25) return greeting(biz);
 
    const cmd = planCommand(input, biz);
    if (cmd) return cmd;
 
    if (has(t, ['thank', 'thanks', 'appreciate'])) {
      return 'You are welcome! Come back any time. Say **next** whenever you are ready for your next step.';
    }
 
    if (has(t, ['growth plan', 'roadmap', 'road map', 'step by step', 'step-by-step', 'action plan', 'grow my business',
      'improve my business', 'improve business', 'business growth', 'walk me through', 'guide me',
      'where do i start', 'what should i do first', 'what do i do next', 'strategy', 'grow my sales'])) {
      return planOverview(biz);
    }
 
    if (has(t, ['stuck', 'bottleneck', 'not getting', 'no customers', 'nobody', 'no one', 'why am i', 'why are', 'not working', 'not growing', 'diagnos', 'what is wrong', "what's wrong"])) {
      return diagnosis(biz);
    }
 
    if (has(t, ['profile', 'check', 'review', 'how am i doing', 'audit', 'improve my listing', 'analy'])) {
      const top = s.missing.slice(0, 3);
      return `Here is a quick check-up for **${name}**. Profile strength: **${s.score}%**.\n\n` +
        (top.length
          ? `Fix these first:\n` + top.map((m, i) => `${i + 1}. **${m.label}.** ${m.tip}`).join('\n')
          : 'Everything important is filled in. Next, run a promotion and ask 5 happy customers to share your listing on their WhatsApp status.') +
        `\n\nFor the full picture, with numbers and an ordered plan, say **growth plan**.`;
    }
 
    if (has(t, ['promo', 'special', 'offer', 'deal', 'discount', 'sale'])) {
      const combo = comboIdea(analyse(biz));
      const c = CAT[biz.category] || CAT.other;
      return `Promotion ideas that work for small businesses:\n` + bullets([
        '**First-time customer offer:** 10% off or a free extra, to get people to try you.',
        '**Quiet-hours special:** a better price at your slowest time of day.',
        '**Bundle:** two or three items at one price (raises what each customer spends).',
        '**Bring a friend:** both get a small discount.',
        '**Pay-day weekend:** a special at month end, when people have money to spend.'
      ]) + (combo
        ? `\n\nBased on your list, try: **${combo.x.name} + ${combo.y.name} for ${money(combo.price)}** (normally ${money(combo.sum)}). Check it still leaves you a profit.`
        : `\n\nFor a ${catLabel(biz)} business, a good one is **${c.promo.title}**.`) +
        `\n\nKeep it time-limited (one or two weeks). Publish it in the **Promotions** tab and it will show on your listing to nearby customers.`;
    }
 
    if (has(t, ['price', 'pricing', 'charge', 'cheap', 'expensive', 'cost', 'afford'])) {
      const a = analyse(biz);
      const own = a.priced.length
        ? `\n\nYour current prices run from ${money(a.min)} to ${money(a.max)}, average ${money(a.avg)}. ${a.max / a.min < 1.3 && a.priced.length >= 3 ? 'They are all very close together. Try adding one cheaper "easy yes" item and one premium option.' : 'Check the cheapest item is an easy first purchase and the dearest is a worthwhile upgrade.'}`
        : '\n\nYou have not listed any prices yet. Add them in the **Products** tab.';
      return `Pricing basics:\n` + bullets([
        'Work out your real cost per item: stock, transport, airtime and your own time. Every sale should leave a profit.',
        'Check 2 or 3 nearby sellers. You do not need to be the cheapest, you need to be the best value.',
        'Use bundles and combos instead of cutting prices.',
        'Round to easy numbers (R20, R50). Change is quicker to give and easier to remember.',
        'Show your prices on your profile. People skip businesses that hide them.'
      ]) + own;
    }
 
    if (has(t, ['photo', 'picture', 'image', 'pic'])) {
      const c = CAT[biz.category] || CAT.other;
      return `Photo tips:\n` + bullets([
        'Use daylight and wipe your phone lens first.',
        `For your type of business, take ${c.photo}.`,
        'Keep the background tidy. Move clutter out of the frame.',
        'Use a fresh photo every month, especially when you have new stock.'
      ]) + (biz.image ? '' : `\n\nYour profile has no photo yet. Add one in the **Profile and address** tab.`);
    }
 
    if (has(t, ['whatsapp', 'social', 'facebook', 'instagram', 'tiktok', 'online', 'advertis', 'market'])) {
      return `Free ways to market ${name}:\n` + bullets([
        '**WhatsApp Business** is free: add your catalogue, hours and address, and use Status to show new stock or specials.',
        '**Share your Corner Market link** in local WhatsApp and Facebook community groups. Use the message on your Overview tab.',
        '**Short videos** (20 seconds) of your product being made or displayed get shared a lot.',
        '**Ask for shares:** after a good sale, ask the customer to tell one friend.',
        '**Be consistent:** post twice a week at the same times.'
      ]) + `\n\nFor the exact steps, say **growth plan**.`;
    }
 
    if (has(t, ['hour', 'open', 'close', 'time', 'schedule'])) {
      return `Opening hours matter more than most owners think. Customers who find you closed rarely try again.\n\n` + bullets([
        'Be consistent. Open at the same times every day you say you are open.',
        'Update your hours when you take a day off or close early.',
        'Look at when you are busiest and be there for it, even if that means shifting your day.',
        'If you cannot be there at all times, say "WhatsApp to order" so customers can still reach you.'
      ]) + (biz.hours ? '' : `\n\nYou have not added hours yet. Add them in the **Profile and address** tab.`);
    }
 
    if (has(t, ['loyal', 'repeat', 'return', 'regular', 'retention', 'come back'])) {
      const c = CAT[biz.category] || CAT.other;
      return `Repeat customers cost far less than new ones.\n\n` + bullets([
        'Learn names and remember what regulars usually order.',
        `Use a stamp card. A good rule for you: ${c.loyalty}`,
        'Collect WhatsApp numbers (with permission) and message when you have new stock or a special.',
        'Say thank you and give a small surprise now and then.',
        'Fix mistakes fast and cheerfully. How you handle a problem is what people remember.'
      ]);
    }
 
    if (has(t, ['money', 'cash', 'save', 'saving', 'stock', 'expense', 'profit', 'budget', 'loan', 'record'])) {
      return `Simple money habits that keep small businesses alive:\n` + bullets([
        'Keep business money and personal money separate, even if it is just two envelopes or two wallets.',
        'Write down every sale and every expense daily in a notebook or on your phone.',
        'Pay yourself a fixed amount each week rather than taking cash whenever you need it.',
        'Keep a small emergency buffer, even R50 a week, for slow days or breakages.',
        'Buy in bulk only for fast-moving stock, and check what sells before you reorder.'
      ]);
    }
 
    if (has(t, ['complain', 'rude', 'service', 'unhappy', 'angry', 'refund', 'staff', 'helper'])) {
      return `Great service is free advertising:\n` + bullets([
        'Greet every customer within a few seconds, even if you are busy ("I will be with you now").',
        'When someone complains: listen fully, say sorry, and offer to fix it. Do not argue.',
        'Keep your area clean and your prices visible.',
        'If you have helpers, agree how you greet, how you handle change and what you do when something goes wrong.'
      ]);
    }
 
    if (has(t, ['compet', 'others', 'rival', 'similar', 'different', 'stand out', 'unique'])) {
      return `Do not compete on price alone. Pick **one thing** to be known for:\n` + bullets([
        'Fastest, freshest, friendliest, cleanest, open latest, or delivers.',
        'Say it in the first sentence of your description.',
        'Then prove it: a photo, a customer comment, a guarantee.'
      ]) + `\n\nFor a ${catLabel(biz)} business, here is a good place to start:\n${CAT_TIPS[biz.category]?.[1] || CAT_TIPS.other[1]}`;
    }
 
    if (has(t, ['type of business', 'my category', 'tips', 'my business', 'advice', 'what should', 'what can'])) {
      return `Tips for your ${catLabel(biz)} business:\n` + bullets(CAT_TIPS[biz.category] || CAT_TIPS.other) +
        `\n\nWant the exact steps for your situation? Say **growth plan**.`;
    }
 
    if (has(t, ['permit', 'licen', 'formal', 'tax', 'sars', 'legal', 'certificate', 'municipal'])) {
      return `Rules differ by area and by business type, so check with your local municipality (and, for food, the environmental health office) about trading permits and certificates.\n\n` +
        bullets([
          'Keep copies of any permit or certificate and show them at your stand. It builds trust.',
          'Keep simple sales records from day one. They help if you later apply for funding or register.',
          'Ask a local small-business support centre about free advice. Many offer it.'
        ]) + `\n\nI am not a legal adviser, so treat this as a starting point.`;
    }
 
    if (has(t, ['customer', 'grow', 'sales', 'more', 'attract', 'busy', 'increase', 'improve'])) {
      return planOverview(biz);
    }
 
    return `I can help with:\n` + bullets([
      '**A step-by-step growth plan** built from your real numbers (say "growth plan")',
      'Finding out where you are stuck (say "where am I stuck?")',
      'Promotion ideas and pricing',
      'Photos, WhatsApp and free marketing',
      'Loyalty, service and simple money habits'
    ]) + `\n\nTry one of the suggestions below, or ask in your own words, for example "how do I get more lunch customers?"`;
  }
 
  async function ask(input, biz, history = []) {
    if (CONFIG.aiEndpoint) {
      try {
        const r = await fetch(CONFIG.aiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: input,
            history: history.slice(-12),
            business: {
              name: biz.name, category: biz.category, description: biz.description,
              offerings: biz.offerings, promotions: biz.promotions,
              profileStrength: strength(biz).score, growthStage: analyse(biz).stage
            }
          })
        });
        if (r.ok) {
          const d = await r.json();
          if (d && d.reply) return String(d.reply);
        }
      } catch { /* fall back to the built-in advisor */ }
    }
    await delay(500 + Math.random() * 500);
    return localReply(input, biz);
  }
 
  return { CONFIG, chips, strength, greeting, ask };
})();
