import jsPDF from "jspdf";

// ── Brand ──────────────────────────────────────────────────────────────────
const C = {
  teal:       "#14b8a6",
  tealDark:   "#0d9488",
  tealLight:  "#ccfbf1",
  dark:       "#0f172a",
  slate:      "#1e293b",
  slate2:     "#334155",
  gray:       "#64748b",
  grayLight:  "#94a3b8",
  light:      "#f8fafc",
  border:     "#e2e8f0",
  white:      "#ffffff",
  gold:       "#f59e0b",
  goldLight:  "#fef3c7",
  green:      "#10b981",
  greenLight: "#d1fae5",
  red:        "#ef4444",
  purple:     "#8b5cf6",
  purpleLight:"#ede9fe",
};

export function exportResultsPDF(event: any) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W   = 210;
  const H   = 297;
  const ML  = 14; // margin left
  const MR  = 14; // margin right
  const CW  = W - ML - MR; // content width
  let   y   = 0;

  // ── Helpers ──────────────────────────────────────────────
  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1,3),16),
    parseInt(hex.slice(3,5),16),
    parseInt(hex.slice(5,7),16),
  ];
  const fill   = (hex: string) => doc.setFillColor(...rgb(hex));
  const stroke = (hex: string) => doc.setDrawColor(...rgb(hex));
  const color  = (hex: string) => doc.setTextColor(...rgb(hex));
  const font   = (style: "normal"|"bold"|"italic" = "normal", size?: number) => {
    doc.setFont("helvetica", style);
    if (size) doc.setFontSize(size);
  };

  const checkY = (needed: number) => {
    if (y + needed > H - 22) {
      drawFooter();
      doc.addPage();
      y = 20;
    }
  };

  const hline = (yy: number, col = C.border, lw = 0.2) => {
    stroke(col); doc.setLineWidth(lw);
    doc.line(ML, yy, W - MR, yy);
  };

  // ── Footer ───────────────────────────────────────────────
  const drawFooter = () => {
    const pg = doc.getCurrentPageInfo().pageNumber;
    hline(H - 14, C.border, 0.3);
    color(C.grayLight); font("normal", 7);
    doc.text("CelerVote  |  Secure Electronic Voting", ML, H - 9);
    doc.text(`${event.title} — Results Report`, W/2, H - 9, { align: "center" });
    doc.text(`Page ${pg}`, W - MR, H - 9, { align: "right" });
  };

  // ══════════════════════════════════════════════════════════
  // PAGE 1 — COVER / HEADER
  // ══════════════════════════════════════════════════════════

  // Full-width dark hero
  fill(C.dark);
  doc.rect(0, 0, W, 52, "F");

  // Left teal accent strip
  fill(C.teal);
  doc.rect(0, 0, 5, 52, "F");

  // Brand name
  color(C.white); font("bold", 22);
  doc.text("CelerVote", ML + 6, 18);

  color(C.teal); font("normal", 8);
  doc.text("Secure Electronic Voting Platform", ML + 6, 25);

  // Divider dot
  fill(C.teal);
  doc.circle(ML + 5, 31, 0.8, "F");

  color(C.grayLight); font("normal", 7.5);
  doc.text("OFFICIAL RESULTS REPORT", ML + 8, 32);

  // Event title — right side
  color(C.white); font("bold", 13);
  const titleLines = doc.splitTextToSize(event.title || "Results", 85);
  doc.text(titleLines, W - MR, 16, { align: "right" });

  // Status badge
  const statusMap: Record<string, {label: string, color: string}> = {
    active:    { label: "LIVE",      color: C.teal },
    ended:     { label: "ENDED",     color: C.gray },
    paused:    { label: "PAUSED",    color: C.gold },
    draft:     { label: "DRAFT",     color: C.purple },
    scheduled: { label: "SCHEDULED", color: C.purple },
  };
  const st = statusMap[event.status] || { label: event.status?.toUpperCase(), color: C.gray };
  const badgeX = W - MR - 22;
  fill(st.color);
  doc.roundedRect(badgeX, 32, 22, 7, 1, 1, "F");
  color(C.white); font("bold", 6.5);
  doc.text(st.label, badgeX + 11, 37, { align: "center" });

  // Generated date
  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  color(C.grayLight); font("normal", 7);
  doc.text(`Generated: ${now}`, W - MR, 44, { align: "right" });

  y = 58;

  // ── Event Meta Row ───────────────────────────────────────
  const categories  = event.categories || [];
  const totalVotes  = event.total_votes || 0;

  const metaItems = [
    { icon: "VOTES",    value: totalVotes.toLocaleString(),                       color: C.teal   },
    { icon: "CATS",     value: String(categories.length),                         color: C.purple },
    { icon: "TYPE",     value: (event.event_type || "").replace(/_/g," ").toUpperCase(), color: C.slate2 },
    { icon: "VOTING",   value: (event.voting_type || "").replace(/_/g," ").toUpperCase(), color: C.slate2 },
  ];
  if (event.is_paid) {
    metaItems.push({ icon: "FEE", value: `${event.currency} ${event.price_per_vote}`, color: C.gold });
  }
  if (event.start_time) {
    metaItems.push({ icon: "START", value: new Date(event.start_time).toLocaleDateString("en-GB"), color: C.gray });
  }
  if (event.end_time) {
    metaItems.push({ icon: "END", value: new Date(event.end_time).toLocaleDateString("en-GB"), color: C.gray });
  }

  // Draw meta cards in rows of 4
  const cardCols  = 4;
  const cardPad   = 3;
  const cardH     = 16;
  const cardWw    = (CW - cardPad * (cardCols - 1)) / cardCols;

  metaItems.forEach((item, i) => {
    const col = i % cardCols;
    const row = Math.floor(i / cardCols);
    if (col === 0 && row > 0) y += cardH + cardPad;
    const cx = ML + col * (cardWw + cardPad);
    const cy = y + row * (cardH + cardPad);

    // Card bg
    fill(C.light);
    stroke(C.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, cy, cardWw, cardH, 2, 2, "FD");

    // Top teal accent
    fill(item.color);
    doc.roundedRect(cx, cy, cardWw, 2, 1, 1, "F");

    // Value
    color(C.dark); font("bold", 10);
    doc.text(item.value, cx + cardWw/2, cy + 8.5, { align: "center", maxWidth: cardWw - 4 });

    // Label
    color(C.gray); font("normal", 6.5);
    doc.text(item.icon, cx + cardWw/2, cy + 13, { align: "center" });
  });

  const metaRows = Math.ceil(metaItems.length / cardCols);
  y += metaRows * (cardH + cardPad) + 4;

  hline(y, C.border, 0.3);
  y += 8;

  // ══════════════════════════════════════════════════════════
  // CATEGORY RESULTS
  // ══════════════════════════════════════════════════════════

  categories.forEach((cat: any, ci: number) => {
    const cands         = [...(cat.candidates || [])].sort((a:any,b:any) => (b.vote_count||0)-(a.vote_count||0));
    const totalCatVotes = cands.reduce((s:number,c:any) => s+(c.vote_count||0), 0);
    const topVotes      = cands[0]?.vote_count || 0;
    const isTied        = cands.length > 1 &&
                          cands[0]?.vote_count === cands[1]?.vote_count &&
                          topVotes > 0;

    checkY(50);

    // ── Category Header ──
    // Left colored bar
    fill(C.teal);
    doc.roundedRect(ML, y, 3, 12, 1, 1, "F");

    // Category number circle
    fill(C.slate);
    doc.circle(ML + 9, y + 6, 5, "F");
    color(C.white); font("bold", 8);
    doc.text(String(ci + 1), ML + 9, y + 8, { align: "center" });

    // Category name
    color(C.dark); font("bold", 12);
    doc.text(cat.name, ML + 18, y + 5);

    // Stats on right
    color(C.gray); font("normal", 7.5);
    doc.text(
      `${cands.length} candidates  |  ${totalCatVotes.toLocaleString()} votes`,
      W - MR, y + 5, { align: "right" }
    );

    // Tied/Winner badge
    if (topVotes > 0) {
      const badgeLabel = isTied ? "TIED" : "DECIDED";
      const badgeColor = isTied ? C.green : C.teal;
      const bw = 18;
      fill(badgeColor);
      doc.roundedRect(W - MR - bw, y + 7, bw, 5, 1, 1, "F");
      color(C.white); font("bold", 5.5);
      doc.text(badgeLabel, W - MR - bw/2, y + 10.5, { align: "center" });
    }

    y += 16;

    if (cands.length === 0) {
      color(C.gray); font("normal", 9);
      doc.text("No candidates recorded.", ML, y);
      y += 10; return;
    }

    // ── Table Header ──
    fill(C.slate);
    doc.roundedRect(ML, y, CW, 8, 1, 1, "F");

    const cols = {
      rank:  { x: ML + 2,   w: 10  },
      name:  { x: ML + 13,  w: 68  },
      votes: { x: ML + 82,  w: 22  },
      share: { x: ML + 105, w: 22  },
      bar:   { x: ML + 128, w: CW - 128 - 1 },
    };

    color(C.white); font("bold", 7.5);
    doc.text("#",        cols.rank.x  + cols.rank.w/2,  y + 5.5, { align: "center" });
    doc.text("CANDIDATE",cols.name.x,                   y + 5.5);
    doc.text("VOTES",    cols.votes.x + cols.votes.w/2, y + 5.5, { align: "center" });
    doc.text("SHARE",    cols.share.x + cols.share.w/2, y + 5.5, { align: "center" });
    doc.text("PROGRESS", cols.bar.x   + cols.bar.w/2,   y + 5.5, { align: "center" });
    y += 8;

    // ── Candidate Rows ──
    cands.forEach((c: any, i: number) => {
      checkY(11);

      const pct    = totalCatVotes > 0 ? (c.vote_count / totalCatVotes * 100) : 0;
      const isLead = c.vote_count === topVotes && topVotes > 0;
      const rowH   = 10;

      // Row background
      if (isLead && !isTied) {
        fill(C.goldLight);
      } else if (isLead && isTied) {
        fill(C.greenLight);
      } else {
        fill(i % 2 === 0 ? C.white : C.light);
      }
      doc.rect(ML, y, CW, rowH, "F");

      // Left accent for leader
      if (isLead) {
        fill(isTied ? C.green : C.gold);
        doc.rect(ML, y, 2, rowH, "F");
      }

      // Rank
      if (isLead && !isTied) {
        fill(C.gold);
        doc.circle(cols.rank.x + cols.rank.w/2, y + rowH/2, 3.5, "F");
        color(C.white); font("bold", 7);
        doc.text("1", cols.rank.x + cols.rank.w/2, y + rowH/2 + 2, { align: "center" });
      } else {
        color(C.gray); font("normal", 8);
        doc.text(String(i+1), cols.rank.x + cols.rank.w/2, y + rowH/2 + 2.5, { align: "center" });
      }

      // Name
      color(isLead && !isTied ? "#92400e" : C.dark);
      font(isLead ? "bold" : "normal", 8.5);
      doc.text(c.name, cols.name.x, y + rowH/2 + 2.5, { maxWidth: cols.name.w - 2 });

      // Votes
      color(C.dark); font("normal", 8.5);
      doc.text((c.vote_count||0).toLocaleString(),
        cols.votes.x + cols.votes.w/2, y + rowH/2 + 2.5, { align: "center" });

      // Share
      color(isLead ? (isTied ? C.green : C.gold) : C.gray);
      font(isLead ? "bold" : "normal", 8.5);
      doc.text(`${pct.toFixed(1)}%`,
        cols.share.x + cols.share.w/2, y + rowH/2 + 2.5, { align: "center" });

      // Progress bar
      const bx = cols.bar.x + 2;
      const by = y + rowH/2 - 1.5;
      const bh = 3;
      const bw = cols.bar.w - 4;
      fill(C.border); doc.roundedRect(bx, by, bw, bh, 1, 1, "F");
      const fw = bw * pct / 100;
      if (fw > 0.5) {
        fill(isLead && !isTied ? C.gold : isTied && isLead ? C.green : C.teal);
        doc.roundedRect(bx, by, fw, bh, 1, 1, "F");
      }

      // Row bottom border
      stroke(C.border); doc.setLineWidth(0.15);
      doc.line(ML, y + rowH, W - MR, y + rowH);
      y += rowH;
    });

    // ── Winner / Tie Callout ──
    if (topVotes > 0) {
      checkY(14);
      y += 3;
      const winPct    = totalCatVotes > 0 ? (topVotes / totalCatVotes * 100).toFixed(1) : "0.0";
      const bgColor   = isTied ? C.greenLight : C.goldLight;
      const acColor   = isTied ? C.green      : C.gold;
      const winnerNames = isTied
        ? cands.filter((c:any) => c.vote_count === topVotes).map((c:any) => c.name).join(" & ")
        : cands[0].name;
      const winText = isTied
        ? `TIED: ${winnerNames} — ${topVotes.toLocaleString()} votes each`
        : `WINNER: ${winnerNames} — ${topVotes.toLocaleString()} votes (${winPct}%)`;

      fill(bgColor);
      doc.roundedRect(ML, y, CW, 10, 2, 2, "F");
      fill(acColor);
      doc.roundedRect(ML, y, 3, 10, 1, 1, "F");
      stroke(acColor); doc.setLineWidth(0.3);
      doc.roundedRect(ML, y, CW, 10, 2, 2, "S");

      color(C.dark); font("bold", 8.5);
      doc.text(winText, ML + 7, y + 6.5, { maxWidth: CW - 10 });
      y += 14;
    } else {
      y += 6;
    }

    // spacing between categories
    y += 4;
  });

  // ══════════════════════════════════════════════════════════
  // SUMMARY SECTION
  // ══════════════════════════════════════════════════════════
  checkY(40);
  hline(y, C.border); y += 8;

  fill(C.slate);
  doc.roundedRect(ML, y, CW, 9, 2, 2, "F");
  color(C.white); font("bold", 10);
  doc.text("RESULTS SUMMARY", ML + CW/2, y + 6.5, { align: "center" });
  y += 13;

  // Summary table
  const summaryRows: any[] = [];
  categories.forEach((cat: any) => {
    const cands     = [...(cat.candidates||[])].sort((a:any,b:any)=>(b.vote_count||0)-(a.vote_count||0));
    const total     = cands.reduce((s:number,c:any)=>s+(c.vote_count||0),0);
    const topV      = cands[0]?.vote_count || 0;
    const isTied    = cands.length > 1 && cands[0]?.vote_count === cands[1]?.vote_count && topV > 0;
    const winPct    = total > 0 ? (topV / total * 100).toFixed(1) : "0.0";
    const winner    = isTied
      ? `TIED: ${cands.filter((c:any)=>c.vote_count===topV).map((c:any)=>c.name).join(" & ")}`
      : (cands[0]?.name || "N/A");
    summaryRows.push({ cat: cat.name, winner, votes: topV, pct: winPct, total, tied: isTied });
  });

  // Summary header
  fill(C.dark); doc.rect(ML, y, CW, 7, "F");
  color(C.white); font("bold", 7.5);
  const sc = [ML+2, ML+52, ML+112, ML+137, ML+155];
  ["CATEGORY","WINNER / OUTCOME","TOP VOTES","SHARE","TOTAL"].forEach((h,i) => {
    doc.text(h, sc[i], y+5);
  });
  y += 7;

  summaryRows.forEach((row, i) => {
    checkY(9);
    fill(i % 2 === 0 ? C.white : C.light);
    doc.rect(ML, y, CW, 8, "F");
    color(C.gray);  font("normal", 7.5); doc.text(row.cat,             sc[0], y+5.5, { maxWidth: 48 });
    color(row.tied ? C.green : C.dark); font(row.tied ? "normal" : "bold", 7.5);
    doc.text(row.winner, sc[1], y+5.5, { maxWidth: 58 });
    color(C.dark); font("normal", 7.5);
    doc.text(String(row.votes), sc[2]+10, y+5.5, { align: "center" });
    color(row.tied ? C.green : C.gold); font("bold", 7.5);
    doc.text(`${row.pct}%`, sc[3]+9, y+5.5, { align: "center" });
    color(C.gray); font("normal", 7.5);
    doc.text(String(row.total), sc[4]+10, y+5.5, { align: "center" });
    stroke(C.border); doc.setLineWidth(0.15);
    doc.line(ML, y+8, W-MR, y+8);
    y += 8;
  });

  y += 10;

  // ── Confidential notice ──
  checkY(16);
  fill(C.light);
  doc.roundedRect(ML, y, CW, 12, 2, 2, "F");
  color(C.gray); font("normal", 7.5);
  doc.text(
    "This document is an official record generated by CelerVote. Results are encrypted and tamper-proof.",
    W/2, y + 5, { align: "center", maxWidth: CW - 10 }
  );
  color(C.grayLight); font("normal", 7);
  doc.text(
    "Confidential — For authorized use only",
    W/2, y + 10, { align: "center" }
  );

  drawFooter();

  // ── Save ──
  const filename = `${event.slug || "results"}-report-${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(filename);
}