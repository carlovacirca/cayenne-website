// Business search for the course creator: Google Places (New) Text Search, UK only, five results.
import type { APIRoute } from 'astro';
import { E, json, notReady, clip, limited } from '../../lib/server';
export const prerender = false;

const GROUPS: [string, string[]][] = [
  ['health', ['dentist', 'dental_clinic', 'doctor', 'physiotherapist', 'veterinary_care', 'pharmacy', 'chiropractor', 'medical_clinic', 'optician', 'hospital']],
  ['beauty', ['hair_salon', 'hair_care', 'beauty_salon', 'barber_shop', 'nail_salon', 'spa', 'beautician', 'tanning_studio', 'massage']],
  ['hosp', ['restaurant', 'cafe', 'coffee_shop', 'bar', 'pub', 'bakery', 'hotel', 'meal_takeaway', 'food', 'catering_service', 'bed_and_breakfast', 'wine_bar']],
  ['trade', ['plumber', 'electrician', 'roofing_contractor', 'general_contractor', 'painter', 'locksmith', 'car_repair', 'moving_company', 'hvac_contractor', 'carpenter', 'landscaper', 'builder', 'car_dealer']],
  ['pro', ['accounting', 'lawyer', 'insurance_agency', 'real_estate_agency', 'finance', 'consultant', 'corporate_office', 'employment_agency', 'travel_agency']],
  ['retail', ['store', 'clothing_store', 'florist', 'gift_shop', 'book_store', 'shoe_store', 'furniture_store', 'hardware_store', 'supermarket', 'jewelry_store', 'electronics_store', 'home_goods_store', 'pet_store']],
  ['creative', ['photographer', 'video_production', 'art_gallery', 'graphic_designer', 'marketing_agency', 'event_planner', 'wedding_venue']],
];
function group(types: string[]) {
  for (const [g, list] of GROUPS) if (types.some(t => list.includes(t))) return g;
  return 'service';
}
function plural(s: string) {
  const w = s.toLowerCase();
  if (/(s|sh|ch|x)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!E.GOOGLE_PLACES_KEY) return notReady('places');
  const q = clip(url.searchParams.get('q'), 80);
  if (q.length < 3) return json({ results: [] });
  if (await limited(request, 'places', 60, 600)) return json({ error: 'slow down' }, 429);
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'X-Goog-Api-Key': E.GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.primaryTypeDisplayName,places.types,places.rating,places.userRatingCount,places.addressComponents',
    },
    body: JSON.stringify({ textQuery: q, regionCode: 'GB', languageCode: 'en-GB', pageSize: 5 }),
  });
  if (!r.ok) return json({ error: 'search failed' }, 502);
  const d: any = await r.json();
  const results = (d.places || []).slice(0, 5).map((p: any) => {
    const comp = (t: string) => (p.addressComponents || []).find((c: any) => (c.types || []).includes(t));
    const town = comp('postal_town')?.longText || comp('locality')?.longText || '';
    const pc = (comp('postal_code')?.longText || '').split(' ')[0];
    const cat = p.primaryTypeDisplayName?.text || 'Business';
    return { id: p.id, name: p.displayName?.text || q, cat, plural: plural(cat), g: group([p.primaryType, ...(p.types || [])]), town, pc, r: p.rating || 0, n: p.userRatingCount || 0 };
  });
  return json({ results, source: 'google' }, 200, { 'cache-control': 'private, max-age=300' });
};
