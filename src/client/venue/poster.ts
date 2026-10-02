import { ACTS, BOLD, drawLogo } from '../world/venue/signs';

// The merch stand's poster to take home (flrnoh fork, see FORK.md "The Schallwerk"): the house's tour
// poster, drawn big on a canvas and handed over as a PNG. Made-up bands, nobody's logos.

export function posterPng(): string {
  const W = 900;
  const H = 1260;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#16070c');
  grd.addColorStop(1, '#3a0a14');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // Rays from the mark.
  g.save();
  g.translate(W / 2, 330);
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.fillStyle = i % 2 ? 'rgba(255,45,61,0.16)' : 'rgba(255,179,71,0.08)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-60, -900);
    g.lineTo(60, -900);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.shadowColor = '#ff2d3d';
  g.shadowBlur = 30;
  drawLogo(g, W / 2, 330, 520, '#ff4d5a');
  g.shadowBlur = 0;
  g.fillStyle = '#f4ead8';
  g.textAlign = 'center';
  g.font = `64px ${BOLD}`;
  g.fillText('HERBST-PROGRAMM', W / 2, 700);
  ACTS.forEach((a, i) => {
    const y = 790 + i * 68;
    g.fillStyle = a.colors[0];
    g.font = `30px ${BOLD}`;
    g.textAlign = 'left';
    g.fillText(a.date, 90, y);
    g.fillStyle = '#f4ead8';
    g.font = `46px ${BOLD}`;
    g.fillText(a.name, 250, y + 4, W - 330);
  });
  g.textAlign = 'center';
  g.fillStyle = '#ffb347';
  g.font = `34px ${BOLD}`;
  g.fillText('SCHALLWERK · KONZERTE · CLUBNÄCHTE · PROBERÄUME', W / 2, H - 60, W - 80);
  return c.toDataURL('image/png');
}
