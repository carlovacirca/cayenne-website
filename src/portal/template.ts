// The standard audit: Section 1 sales and marketing (starting with where the money comes in), Section 2 operations.
// A client's own question bank can replace it through an import; the field keys below drive the live rules.
import type { Template } from './logic';

export const DEFAULT_GROUPS = [
  { id: 'biz', name: 'The business' }, { id: 'sell', name: 'How they sell today' }, { id: 'web', name: 'Website' },
  { id: 'google', name: 'Google and reviews' }, { id: 'social', name: 'Social media' }, { id: 'market', name: 'The market and rivals' },
];

export const DEFAULT_TEMPLATE: Template = {
  id: 'standard-v1',
  name: 'Standard audit',
  sections: { '1': 'Section 1: Sales and marketing', '2': 'Section 2: Operations' },
  stages: [
    { id: 'money', sec: 1, name: 'Where money comes in', short: 'Money', qs: [
      { id: 'm1', t: 'Roughly what comes in each month, and from how many orders?', hint: 'Ballpark is fine. A normal month, not the busiest.', f: [
        { k: 'rev_m', type: 'num', label: 'Sales a month (£)' }, { k: 'orders_w', type: 'num', label: 'Orders a week' }, { k: 'aov', type: 'num', label: 'Average order (£)' }] },
      { id: 'm2', t: 'Of every £100 that comes in, how much comes from each place?', hint: 'Rough % is fine. The total shows under Baseline numbers.', f: [
        { k: 'ch_counter', type: 'num', label: 'Counter or walk-in %' }, { k: 'ch_phone', type: 'num', label: 'Phone and email %' }, { k: 'ch_webuk', type: 'num', label: 'Website checkout %' },
        { k: 'ch_export', type: 'num', label: 'Export or quotes abroad %' }, { k: 'ch_ebay', type: 'num', label: 'eBay %' }, { k: 'ch_other', type: 'num', label: 'Other marketplaces %' }] },
      { id: 'm3', t: 'Who buys? Split sales by type of customer.', f: [
        { k: 'cu_trade', type: 'num', label: 'Trade customers %' }, { k: 'cu_public', type: 'num', label: 'Public %' }, { k: 'cu_resell', type: 'num', label: 'Resellers %' },
        { k: 'cu_sector', type: 'num', label: 'Public sector and charities %' }, { k: 'cu_export', type: 'num', label: 'Export buyers %' }] },
      { id: 'm4', t: 'Which accounts, products and services make the most money?', f: [
        { k: 'top10', type: 'num', label: 'Top 10 accounts, % of sales' }, { k: 'margin', type: 'num', label: 'Gross margin %' }, { k: 'best_lines', type: 'text', label: 'Best sellers' }] },
      { id: 'm5', t: 'How many customers come back, and what marketing has ever worked?', f: [
        { k: 'repeat_pct', type: 'num', label: 'Repeat customers %' }, { k: 'keep_touch', type: 'select', label: 'Keep in touch with past buyers', opts: ['', 'Never', 'Newsletter now and then', 'Regularly'] },
        { k: 'list_n', type: 'num', label: 'Emails on the mailing list' }, { k: 'mkt_spend', type: 'num', label: 'Marketing spend a month (£)' },
        { k: 'mkt_now', type: 'chips', opts: ['Google Ads', 'Bing Ads', 'Google Shopping', 'SEO agency', 'Social posts', 'eBay', 'Trade shows', 'Catalogue or print', 'Word of mouth only', 'Nothing'] }] },
    ] },
    { id: 'online', sec: 1, name: 'Website, Google and socials', short: 'Online', qs: [
      { id: 'w1', t: 'Who built and looks after the website, what does it cost, and who holds the logins?', f: [
        { k: 'web_who', type: 'select', label: 'Looked after by', opts: ['', 'In-house', 'Agency', 'Freelancer', 'Not sure'] }, { k: 'web_cost', type: 'num', label: 'Cost a month (£)' },
        { k: 'access', type: 'chips', opts: ['Website admin', 'Hosting', 'Domains', 'Google Analytics', 'Search Console', 'Merchant Center', 'Google Business Profile', 'Ads accounts'] }] },
      { id: 'w2', t: 'How do products get onto the website, and what do customers ask that it does not answer?', f: [
        { k: 'merge', type: 'select', label: 'One website?', opts: ['', 'Happy to merge into one', 'Keep both', 'Need to think', 'Only one already'] }, { k: 'web_skus', type: 'num', label: 'Products on the website now' },
        { k: 'add_how', type: 'select', label: 'How products are added', opts: ['', 'Added by hand', 'Bulk upload from a supplier file', 'Synced from our stock system', 'Not sure'] },
        { k: 'cust_ask', type: 'chips', opts: ['Is it genuine?', 'Will it fit?', 'Price', 'In stock?', 'Delivery time', 'Shipping abroad', 'Trade discount'] }] },
      { id: 'g1', t: 'Google profile and reviews: who has the login, is anyone posting, are reviews asked for?', f: [
        { k: 'gbp_access', type: 'select', label: 'Google profile login', opts: ['', 'We have it', 'Agency has it', 'Lost access', 'Not sure'] },
        { k: 'gbp_posts', type: 'select', label: 'Google posts', opts: ['', 'Never', 'Sometimes', 'Weekly'] },
        { k: 'reviews_ask', type: 'select', label: 'Asks for reviews', opts: ['', 'Never', 'Sometimes', 'Always'] },
        { k: 'rev_where', type: 'chips', opts: ['Google', 'Trustpilot', 'eBay feedback', 'Facebook'] }] },
      { id: 'g2', t: 'Socials: who runs them, and are all the pages under their control?', f: [
        { k: 'social_who', type: 'select', label: 'Socials run by', opts: ['', 'Someone in-house', 'An agency', 'Nobody', 'Not sure'] },
        { k: 'fbuk', type: 'select', label: 'Every page bearing their name is theirs', opts: ['', 'Ours', 'Not ours', 'Not sure'] },
        { k: 'photos', type: 'select', label: 'Photos of team, premises, work', opts: ['', 'Happy to show them', 'Maybe', 'Rather not'] }] },
    ] },
    { id: 'growth', sec: 1, name: 'Marketplaces and new business', short: 'Growth', qs: [
      { id: 'k1', t: 'eBay and Amazon: do they sell there, and would they if it ran from the stock list?', f: [
        { k: 'ebay_status', type: 'select', label: 'eBay today', opts: ['', 'Selling now', 'Stopped', 'Never tried', 'Not sure'] }, { k: 'ebay_why', type: 'text', label: 'Why it stopped' },
        { k: 'mkt_yes', type: 'select', label: 'Sell there if it ran itself?', opts: ['', 'Yes', 'Maybe', 'No'] }] },
      { id: 'k2', t: 'Google Shopping and ads: is there a Merchant Center feed or an ads account, and who runs it?', f: [
        { k: 'mc', type: 'select', label: 'Merchant Center feed', opts: ['', 'Yes, feed running', 'Yes, but not looked after', 'No', 'Not sure'] }, { k: 'ads_spend', type: 'num', label: 'Ads spend a month (£)' }] },
      { id: 'l1', t: 'Who do they want more of, and how much more can they handle?', f: [
        { k: 'want_more', type: 'chips', opts: ['Trade accounts', 'Local businesses', 'Public', 'Resellers', 'Public sector', 'Export buyers'] },
        { k: 'cap_orders', type: 'num', label: 'Extra orders a week they could handle' },
        { k: 'outreach', type: 'select', label: 'Finding new customers', opts: ['', 'Nobody looks for new customers', 'Sometimes', 'A sales rep does'] }] },
      { id: 'l2', t: 'Export: which countries buy most, and how do those leads come in?', f: [
        { k: 'exp_countries', type: 'text', label: 'Top countries' },
        { k: 'exp_leads', type: 'chips', opts: ['Website form', 'Email', 'WhatsApp', 'Phone', 'Distributors', 'Trade fairs', 'Repeat buyers'] }] },
    ] },
    { id: 'enq', sec: 2, name: 'Enquiries and orders in', short: 'Enquiries', qs: [
      { id: 'o1', t: 'How many calls, emails, chats and walk-ins a day?', hint: 'A normal weekday.', f: [
        { k: 'calls_d', type: 'num', label: 'Calls a day' }, { k: 'emails_d', type: 'num', label: 'Emails a day' }, { k: 'chats_d', type: 'num', label: 'Chats a day' }, { k: 'walk_d', type: 'num', label: 'Walk-ins a day' }] },
      { id: 'o2', t: 'How many calls are missed, and what happens to them?', f: [
        { k: 'missed_d', type: 'num', label: 'Missed calls a day' },
        { k: 'missed_what', type: 'select', label: 'What usually happens', opts: ['', 'Called back the same day', 'Called back later', 'Voicemail, sometimes lost', 'Often lost', 'Not sure'] }] },
      { id: 'o3', t: 'How fast is the first reply to an email or chat, and who replies?', f: [
        { k: 'reply', type: 'select', label: 'Typical first reply', opts: ['', 'Within an hour', 'Same day', 'Next day', '2 days or more'] }, { k: 'who_reply', type: 'text', label: 'Who replies' }] },
      { id: 'o4', t: 'Where are enquiries and orders written down?', f: [
        { k: 'log', type: 'chips', opts: ['Paper or notebook', 'Email inbox only', 'Excel', 'Website admin', 'Accounts software', 'Stock system', 'A CRM', 'Nowhere'] }] },
    ] },
    { id: 'quote', sec: 2, name: 'Product ID and quoting', short: 'Quoting', qs: [
      { id: 'p1', t: 'What is needed from a customer to find the right product, and where is it looked up?', f: [
        { k: 'need', type: 'chips', opts: ['Reg number', 'VIN or chassis', 'Part or model number', 'Photos', 'Measurements', 'Old item in hand'] },
        { k: 'id_tool', type: 'chips', opts: ['Manufacturer catalogue', 'Supplier portals', 'Our own stock system', 'Experience'] }] },
      { id: 'p2', t: 'How many quotes a day, how long each, and how many turn into orders?', f: [
        { k: 'quotes_d', type: 'num', label: 'Quotes a day' }, { k: 'quote_min', type: 'num', label: 'Minutes per quote' }, { k: 'win10', type: 'num', label: 'Won out of 10' }] },
      { id: 'p3', t: "Are quotes that don't buy followed up, and how are prices set?", f: [
        { k: 'followup', type: 'select', label: 'Follow-up', opts: ['', 'Never', 'Sometimes', 'Always'] },
        { k: 'pricing', type: 'select', label: 'Prices set by', opts: ['', 'Fixed % off list price', 'Cost plus a margin', 'Different per customer', 'Case by case'] }] },
    ] },
    { id: 'stock', sec: 2, name: 'Stock and suppliers', short: 'Stock', qs: [
      { id: 's1', t: 'Where does the stock list live, and does the website update itself?', f: [
        { k: 'stock_sys', type: 'text', label: 'Stock system' },
        { k: 'stock_sync', type: 'select', label: 'Website stock', opts: ['', 'Website updates automatically', 'Updated by hand', 'Not linked', 'Not sure'] }] },
      { id: 's2', t: 'How are supplier orders placed, and how many special orders a day?', f: [
        { k: 'po_method', type: 'select', label: 'Supplier orders', opts: ['', 'Email or phone, by hand', 'Supplier portal', 'Automatic reorder'] },
        { k: 'special_d', type: 'num', label: 'Special orders a day' }, { k: 'po_min', type: 'num', label: 'Minutes per supplier order' }] },
      { id: 's3', t: 'How much slow or dead stock is there, and how is it cleared?', f: [
        { k: 'dead', type: 'num', label: 'Slow or dead stock (£)' },
        { k: 'clear', type: 'chips', opts: ['Special offers page', 'eBay', 'Trade deals', 'Sit on it'] }] },
    ] },
    { id: 'ship', sec: 2, name: 'Dispatch, returns and export', short: 'Dispatch', qs: [
      { id: 'd1', t: 'Parcels a day, couriers, and how labels and tracking are done', f: [
        { k: 'parcels_d', type: 'num', label: 'Parcels a day' }, { k: 'label_min', type: 'num', label: 'Minutes per parcel (pick, pack, label)' }, { k: 'couriers', type: 'text', label: 'Couriers used' },
        { k: 'label_how', type: 'select', label: 'Labels made', opts: ['', "Typed into the courier's website", 'Shipping software', 'Linked to the website', 'Not sure'] },
        { k: 'tracking', type: 'select', label: 'Tracking to customers', opts: ['', 'Sent automatically', 'Sent by hand', 'Not sent'] }] },
      { id: 'd2', t: 'Export: orders a week, time on each, and how they pay', f: [
        { k: 'exp_w', type: 'num', label: 'Export orders a week' }, { k: 'exp_min', type: 'num', label: 'Minutes per export order (quote, freight, paperwork)' },
        { k: 'exp_pay', type: 'chips', opts: ['Bank transfer', 'Card', 'PayPal', 'Proforma first'] }] },
      { id: 'd3', t: 'Returns and wrong items: how many a month, and why?', f: [
        { k: 'returns_m', type: 'num', label: 'Returns a month' },
        { k: 'ret_why', type: 'chips', opts: ['Customer ordered the wrong part', 'We sent the wrong part', 'Damaged in transit', 'Changed their mind'] }] },
    ] },
    { id: 'team', sec: 2, name: 'Accounts, team and tools', short: 'Team & tools', qs: [
      { id: 't1', t: 'Accounts: which software, how many credit accounts, what is overdue, and how long goes on chasing?', f: [
        { k: 'acc_tool', type: 'text', label: 'Accounts software' }, { k: 'credit_n', type: 'num', label: 'Credit accounts' }, { k: 'overdue', type: 'num', label: 'Invoices overdue now' }, { k: 'chase_h', type: 'num', label: 'Hours a month chasing' }] },
      { id: 't2', t: 'Who does what? Staff in sales, warehouse and admin.', f: [
        { k: 'staff_sales', type: 'num', label: 'Sales and counter' }, { k: 'staff_wh', type: 'num', label: 'Warehouse and dispatch' }, { k: 'staff_admin', type: 'num', label: 'Admin and accounts' }] },
      { id: 't3', t: 'The 10 most repeated tasks: minutes each and times a week.', hint: 'Hours a year = minutes × times a week × 46 ÷ 60.', f: [{ k: 'tasks', type: 'tasks' }] },
      { id: 't4', t: 'Which tools are used every day?', f: [
        { k: 'tools', type: 'chips', opts: ['Website admin', 'Sage', 'Xero', 'QuickBooks', 'Excel', 'Outlook', 'Gmail', 'Live chat', 'WhatsApp', 'Courier websites', 'Supplier catalogues', 'Phone system'] }] },
      { id: 't5', t: 'What could AI take on, what must a person approve, and what should one morning screen show?', f: [
        { k: 'ai_ok', type: 'long', label: 'Happy to hand over' }, { k: 'ai_approve', type: 'long', label: 'Must approve or never hand over' },
        { k: 'dash', type: 'chips', opts: ["Today's orders", 'Open quotes', 'Missed calls', 'Stock to reorder', 'Overdue invoices', 'Export pipeline', 'Web and marketplace sales', 'New reviews'] }] },
    ] },
  ],
};
