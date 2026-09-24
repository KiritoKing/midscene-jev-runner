import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

const photoNames = new Set([
  'room-plaza.jpg',
  'lisbon-cityscape.jpg',
  'porto-cityscape.jpg',
  'london-skyline.jpg',
  'paris-skyline.jpg',
  'room-windows.jpg',
  'room-flickr.jpg',
  'room-fonda.jpg',
]);

const photos = new Map<string, string>();

export function photoDataUri(name: string): string {
  if (!photoNames.has(name)) throw new Error(`Unknown local photo: ${name}`);
  let value = photos.get(name);
  if (!value) {
    value = `data:image/jpeg;base64,${readFileSync(new URL(`./assets/${name}`, import.meta.url)).toString('base64')}`;
    photos.set(name, value);
  }
  return value;
}

export const baseCss = `
:root{font-family:Arial,Helvetica,sans-serif;color:#202124;background:#fff;font-size:14px}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button{cursor:pointer}a{color:#1a73e8;text-decoration:none}a:hover{text-decoration:underline}input,select{color:#202124}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #1a73e8;outline-offset:2px}.muted{color:#5f6368}.travel-top{border-bottom:1px solid #dadce0;background:#fff;position:sticky;top:0;z-index:15}.travel-top-inner{height:64px;max-width:1440px;margin:auto;display:flex;align-items:center;padding:0 28px;gap:26px}.travel-logo{font-size:24px;letter-spacing:-1px;font-weight:600;color:#202124;white-space:nowrap}.travel-logo span:nth-child(1){color:#4285f4}.travel-logo span:nth-child(2){color:#ea4335}.travel-logo span:nth-child(3){color:#fbbc05}.travel-logo span:nth-child(4){color:#4285f4}.travel-logo span:nth-child(5){color:#34a853}.travel-logo span:nth-child(6){color:#ea4335}.travel-top nav{display:flex;align-items:center;gap:28px;height:100%}.travel-top nav a{color:#5f6368;font-size:14px;height:100%;display:flex;align-items:center}.travel-top nav a.active{color:#1a73e8;border-bottom:3px solid #1a73e8}.travel-actions{margin-left:auto;display:flex;gap:15px;align-items:center;color:#5f6368}.travel-actions .avatar{width:30px;height:30px;background:#2b7858;color:#fff;border-radius:50%;display:grid;place-items:center;font-weight:bold}.travel-main{max-width:1120px;margin:0 auto;padding:26px 24px 80px}.travel-main h1{font-size:28px;font-weight:500;margin:12px 0 8px}.travel-main h2{font-size:21px;font-weight:500;margin:0 0 13px}.travel-main p{line-height:1.55}.card{background:#fff;border:1px solid #dadce0;border-radius:16px;box-shadow:0 1px 3px #20212412}.blue-button{border:0;background:#1a73e8;color:#fff;border-radius:24px;padding:11px 23px;font-weight:600}.blue-button:hover{background:#1765c1}.outline-button{border:1px solid #dadce0;background:#fff;border-radius:24px;padding:10px 16px;color:#1967d2}.chip{border:1px solid #dadce0;border-radius:23px;background:#fff;padding:8px 14px;color:#3c4043}.chip:hover{background:#f1f3f4}.badge{background:#e6f4ea;color:#137333;border-radius:5px;padding:3px 6px;font-size:11px;font-weight:600}#notice{background:#fce8e6;border-radius:8px;color:#a50e0e;padding:10px;margin:12px 0;display:none}.footer{border-top:1px solid #dadce0;padding:22px 28px;color:#5f6368;font-size:12px}.footer-inner{max-width:1120px;margin:auto}.footer a{margin-right:18px}.visually-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}[hidden]{display:none!important}@media(max-width:750px){.travel-top-inner{padding:0 14px;gap:10px}.travel-top nav{gap:10px}.travel-top nav a{font-size:12px}.travel-actions{display:none}.travel-main{padding:20px 14px}.travel-logo{font-size:20px}}
`;

export function page(
  title: string,
  active: 'Flights' | 'Hotels',
  runId: string,
  body: string,
  style: string,
  script: string,
): string {
  const previous = /^nav-([a-f0-9]{20})-(?:flights|hotel)$/.exec(runId);
  const key =
    previous?.[1] ??
    createHash('sha256').update(runId).digest('hex').slice(0, 20);
  const flightsId = active === 'Flights' ? runId : `nav-${key}-flights`;
  const hotelId = active === 'Hotels' ? runId : `nav-${key}-hotel`;
  const current =
    active === 'Flights'
      ? `/scenario/flights?runId=${encodeURIComponent(runId)}`
      : `/scenario/hotel?runId=${encodeURIComponent(runId)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - Travel</title><style>${baseCss}${style}.travel-top nav span{color:#9aa0a6;font-size:14px}.footer-inner{display:flex;flex-wrap:wrap;gap:18px}</style></head><body><header class="travel-top"><div class="travel-top-inner"><a class="travel-logo" href="${current}" aria-label="Travel home"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span> <small>Travel</small></a><nav aria-label="Travel sections"><span>Explore</span><a class="${active === 'Flights' ? 'active' : ''}" href="/scenario/flights?runId=${encodeURIComponent(flightsId)}">Flights</a><a class="${active === 'Hotels' ? 'active' : ''}" href="/scenario/hotel?runId=${encodeURIComponent(hotelId)}">Hotels</a><span>Things to do</span></nav><div class="travel-actions"><span>◉</span><span>⋮</span><span class="avatar">T</span></div></div></header>${body}<footer id="footer" class="footer"><div class="footer-inner"><span>About</span><span>Privacy</span><span>Terms</span><span>Illustrative local travel search fixture. Prices and availability are sample data.</span></div></footer><script>${script}</script></body></html>`;
}
