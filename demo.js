// Trial mode: same layout as the real rota sheet, filled with sample names
window.MP_DEMO_ROWS = (() => {
  const rows = Array.from({ length: 30 }, () => Array(18).fill(''));
  rows[1].splice(4, 14, 'Set-Up', 'Shift 1', '', '', 'Shift 2', '', '', 'Shift 3', '', '', 'Shift 4', '', '', 'Set-Down');
  rows[2][1] = 'Shift Time'; rows[2][2] = 'Start';
  rows[2].splice(4, 14, '15:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '06:00');
  rows[3][2] = 'End';
  rows[3].splice(4, 14, '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '07:00');
  rows[4][2] = 'Minister incharge'; [4, 5, 8, 11, 14, 17].forEach((c) => (rows[4][c] = 'Deacon Niyi'));
  rows[5][2] = 'Department Head'; [[4, 'Both'], [5, 'Ife'], [8, 'Ife'], [11, 'Dr Joe'], [14, 'Dr Joe'], [17, 'Both']].forEach(([c, v]) => (rows[5][c] = v));
  const teams = ['Projection', 'Live Stream', 'Social Media', 'Sound', 'Photography', 'Videography', 'Graphics', 'Light'];
  const pool = ['Tolu', 'Bisi', 'Kemi', 'Seun', 'Ada', 'Femi', 'Jide', 'Ruth', 'Grace', 'Daniel', 'Esther', 'Paul', 'Tobi', 'Funmi', 'David', 'Joy', 'Sam', 'Lola', 'Emeka', 'Hannah', 'Manny'];
  let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  let r = 6;
  for (const t of teams) {
    ['Team Lead', 'Main', 'Backup'].forEach((role, i) => {
      if (i === 0) rows[r][2] = t;
      rows[r][3] = role;
      [4, 5, 8, 11, 14, 17].forEach((c) => { if (rnd() < 0.9) rows[r][c] = pool[Math.floor(rnd() * (pool.length - 1))]; });
      r++;
    });
  }
  // Manny's sample shifts
  rows[6][8] = 'Manny'; rows[7][5] = 'Manny'; rows[13][11] = 'Manny'; rows[12][17] = 'Manny';
  // an example of a shift split by the hour (Sound · Main · Shift 2)
  rows[16][8] = 'Paul'; rows[16][9] = 'Paul'; rows[16][10] = 'Grace';
  return rows;
})();
