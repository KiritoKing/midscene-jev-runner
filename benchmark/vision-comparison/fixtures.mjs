// Public synthetic tasks. Gold and event history stay in the harness, never in model input.
export const seeds = [17, 29, 43];
export const tasks = [
  {
    id: 'dom-identity',
    kind: 'action',
    modality: 'dom',
    goal: 'Open Cedar, not Maple.',
  },
  {
    id: 'dom-prerequisite',
    kind: 'action',
    modality: 'dom',
    goal: 'Select consent, then submit.',
  },
  {
    id: 'dom-preserve',
    kind: 'action',
    modality: 'dom',
    goal: 'Leave notifications enabled. Do not toggle them off.',
  },
  {
    id: 'dom-condition',
    kind: 'assertion',
    modality: 'dom',
    goal: 'Notifications are enabled.',
  },
  {
    id: 'canvas-present',
    kind: 'assertion',
    modality: 'visual',
    goal: 'A green circle is visible.',
  },
  {
    id: 'canvas-absent',
    kind: 'assertion',
    modality: 'visual',
    goal: 'A green circle is visible.',
  },
  {
    id: 'canvas-condition',
    kind: 'assertion',
    modality: 'visual',
    goal: 'The READY indicator is green.',
  },
  {
    id: 'canvas-target',
    kind: 'action',
    modality: 'visual',
    goal: 'Click the green circle, not the red square.',
  },
];
export const viewport = { width: 960, height: 640 };
export function fixture(task, seed) {
  const events = [];
  const enabled = seed !== 29;
  const x = 120 + ((seed * 47) % 400);
  const y = 150 + ((seed * 31) % 220);
  let html = '';
  let truth = null;
  if (task.id === 'dom-identity') {
    const labels = seed === 29 ? ['Maple', 'Cedar'] : ['Cedar', 'Maple'];
    html = labels
      .map(
        (label) =>
          `<section><h2>${label}</h2><button onclick="report('${label}');this.textContent='Opened'">Open</button></section>`,
      )
      .join('');
  } else if (task.id === 'dom-prerequisite') {
    html = `<label><input type="checkbox" onchange="document.querySelector('button').disabled=!this.checked;report(this.checked?'consent-on':'consent-off')">Consent</label><button disabled onclick="report('submitted');this.textContent='Submitted'">Submit</button>`;
  } else if (task.id === 'dom-preserve' || task.id === 'dom-condition') {
    const checked = task.kind === 'action' || enabled;
    truth = checked;
    html = `<label><input type="checkbox" ${checked ? 'checked' : ''} onchange="report(this.checked?'on':'off')">Notifications</label>`;
  } else {
    const present = task.id !== 'canvas-absent';
    truth = task.id === 'canvas-condition' ? enabled : present;
    html = `<canvas width="960" height="640"></canvas><script>
      const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,960,640);
      ctx.fillStyle='#c62828';ctx.fillRect(700,120,100,100);
      ${task.id === 'canvas-condition' ? `ctx.fillStyle='${enabled ? '#008000' : '#c62828'}';ctx.fillRect(${x},${y},180,90);ctx.fillStyle='white';ctx.font='bold 30px sans-serif';ctx.fillText('READY',${x + 30},${y + 55});` : present ? `ctx.fillStyle='#008000';ctx.beginPath();ctx.arc(${x},${y},50,0,Math.PI*2);ctx.fill();` : ''}
      canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)*960/r.width,y=(e.clientY-r.top)*640/r.height;report({x,y});ctx.fillStyle='#222';ctx.font='24px sans-serif';ctx.fillText('Selection recorded',30,580)});
      </script>`;
  }
  return {
    task,
    seed,
    truth,
    events,
    html: `<!doctype html><html lang="en"><meta charset="utf-8"><title>Interaction sample</title><style>body{margin:0;font:24px sans-serif;background:white}section,label{display:block;padding:24px}button{font:24px sans-serif;padding:15px}canvas{display:block}</style><script>const report=(event)=>window.recordFixtureEvent(event)</script><body>${html}</body></html>`,
    record: (event) => events.push(event),
    success() {
      if (task.id === 'dom-identity')
        return events.includes('Cedar') && !events.includes('Maple');
      if (task.id === 'dom-prerequisite')
        return (
          events.indexOf('consent-on') >= 0 &&
          events.indexOf('submitted') > events.indexOf('consent-on') &&
          !events.includes('consent-off')
        );
      if (task.id === 'dom-preserve') return events.length === 0;
      if (task.id === 'canvas-target')
        return (
          events.length > 0 &&
          events.every(
            (e) => typeof e === 'object' && Math.hypot(e.x - x, e.y - y) <= 50,
          )
        );
      return null;
    },
    misclicks() {
      if (task.id === 'canvas-target')
        return events.filter(
          (e) => typeof e !== 'object' || Math.hypot(e.x - x, e.y - y) > 50,
        ).length;
      if (task.id === 'dom-identity')
        return events.filter((e) => e === 'Maple').length;
      if (task.id === 'dom-preserve') return events.length;
      return events.filter((e) => e === 'consent-off').length;
    },
  };
}
export async function mount(page, specimen) {
  await page.exposeFunction('recordFixtureEvent', specimen.record);
  await page.setContent(specimen.html);
  await page.evaluate(() => document.fonts.ready);
}
