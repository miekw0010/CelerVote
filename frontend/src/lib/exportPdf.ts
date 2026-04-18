import jsPDF from "jspdf";

// ── Brand ──────────────────────────────────────────────────────────────────
const C = {
  navy:       "#002856",
  navyDark:   "#001a38",
  orange:     "#e87200",
  orangeLight:"#fef3c7",
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
  teal:       "#14b8a6",
  tealLight:  "#ccfbf1",
};

export function exportResultsPDF(event: any) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W   = 210;
  const H   = 297;
  const ML  = 12;
  const MR  = 12;
  const CW  = W - ML - MR;
  let   y   = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────
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
      y = 18;
    }
  };

  const hline = (yy: number, col = C.border, lw = 0.2) => {
    stroke(col); doc.setLineWidth(lw);
    doc.line(ML, yy, W - MR, yy);
  };

  // ── Footer ───────────────────────────────────────────────────────────────
  const drawFooter = () => {
    const pg = doc.getCurrentPageInfo().pageNumber;
    hline(H - 14, C.border, 0.3);
    color(C.grayLight); font("normal", 7);
    doc.text("CelerVote  |  Secure Electronic Voting", ML, H - 9);
    doc.text(`${event.title} — Results Report`, W/2, H - 9, { align: "center" });
    doc.text(`Page ${pg}`, W - MR, H - 9, { align: "right" });
  };

  const isOrg   = event.voting_mode === "organizational";
  const categories = event.categories || [];

  // Separate global vs group categories for org elections
  const globalCats = isOrg ? categories.filter((c: any) => c.is_global !== false) : categories;
  const groupCats  = isOrg ? categories.filter((c: any) => c.is_global === false)  : [];

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — HEADER
  // ══════════════════════════════════════════════════════════════════════════

  // Full-width dark hero
  fill(C.navy);
  doc.rect(0, 0, W, 54, "F");

  // Left accent strip
  fill(C.orange);
  doc.rect(0, 0, 5, 54, "F");

  // Brand
  color(C.white); font("bold", 22);
  doc.text("CelerVote", ML + 6, 18);
  color(C.orange); font("normal", 8);
  doc.text("Secure Electronic Voting Platform", ML + 6, 25);

  // Report label
  fill(C.orange);
  doc.circle(ML + 5, 31, 0.8, "F");
  color(C.grayLight); font("normal", 7.5);
  doc.text("OFFICIAL RESULTS REPORT", ML + 8, 32);

  // Org election badge
  if (isOrg) {
    fill(C.purple);
    doc.roundedRect(ML + 6, 35, 36, 6, 1, 1, "F");
    color(C.white); font("bold", 6);
    doc.text("ORGANISATIONAL ELECTION", ML + 24, 39.5, { align: "center" });
  }

  // Event title — right side
  color(C.white); font("bold", 13);
  const titleLines = doc.splitTextToSize(event.title || "Results", 90);
  doc.text(titleLines, W - MR, 16, { align: "right" });

  // Status badge
  const statusMap: Record<string, {label: string, color: string}> = {
    active:    { label: "LIVE",      color: C.teal   },
    ended:     { label: "ENDED",     color: C.gray   },
    paused:    { label: "PAUSED",    color: C.gold   },
    draft:     { label: "DRAFT",     color: C.purple },
    scheduled: { label: "SCHEDULED", color: C.purple },
  };
  const st = statusMap[event.status] || { label: (event.status||"").toUpperCase(), color: C.gray };
  fill(st.color);
  doc.roundedRect(W - MR - 22, 33, 22, 7, 1, 1, "F");
  color(C.white); font("bold", 6.5);
  doc.text(st.label, W - MR - 11, 38, { align: "center" });

  // Generated date
  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  color(C.grayLight); font("normal", 7);
  doc.text(`Generated: ${now}`, W - MR, 46, { align: "right" });

  y = 60;

  // ── Event Meta Cards ─────────────────────────────────────────────────────
  const totalVotes = event.total_votes || 0;

  const metaItems: any[] = [
    { icon: "TOTAL VOTES", value: totalVotes.toLocaleString(),                              color: C.teal   },
    { icon: "CATEGORIES",  value: String(categories.length),                                color: C.purple },
    { icon: "TYPE",        value: (event.event_type||"").replace(/_/g," ").toUpperCase(),   color: C.slate2 },
    { icon: "VOTING",      value: (event.voting_type||"").replace(/_/g," ").toUpperCase(),  color: C.slate2 },
  ];
  if (isOrg) {
    metaItems.push({ icon: "MODE",    value: "ORGANISATIONAL",                              color: C.purple });
    metaItems.push({ icon: "GENERAL", value: String(globalCats.length) + " categories",     color: C.navy   });
    if (groupCats.length > 0) {
      metaItems.push({ icon: "GROUP", value: String(groupCats.length) + " categories",      color: C.orange });
    }
  }
  if (event.is_paid)    metaItems.push({ icon: "FEE",   value: `${event.currency} ${event.price_per_vote}`, color: C.gold });
  if (event.start_time) metaItems.push({ icon: "START", value: new Date(event.start_time).toLocaleDateString("en-GB"), color: C.gray });
  if (event.end_time)   metaItems.push({ icon: "END",   value: new Date(event.end_time).toLocaleDateString("en-GB"),   color: C.gray });

  const cardCols = 4;
  const cardPad  = 3;
  const cardH    = 16;
  const cardWw   = (CW - cardPad * (cardCols - 1)) / cardCols;

  metaItems.forEach((item, i) => {
    const col = i % cardCols;
    const row = Math.floor(i / cardCols);
    const cx  = ML + col * (cardWw + cardPad);
    const cy  = y + row * (cardH + cardPad);
    fill(C.light); stroke(C.border); doc.setLineWidth(0.2);
    doc.roundedRect(cx, cy, cardWw, cardH, 2, 2, "FD");
    fill(item.color); doc.roundedRect(cx, cy, cardWw, 2, 1, 1, "F");
    color(C.dark); font("bold", 9);
    doc.text(item.value, cx + cardWw/2, cy + 9, { align: "center", maxWidth: cardWw - 4 });
    color(C.gray); font("normal", 6);
    doc.text(item.icon, cx + cardWw/2, cy + 13.5, { align: "center" });
  });

  const metaRows = Math.ceil(metaItems.length / cardCols);
  y += metaRows * (cardH + cardPad) + 4;

  hline(y, C.border, 0.3); y += 8;

  // ══════════════════════════════════════════════════════════════════════════
  // HELPER: draw one category block
  // ══════════════════════════════════════════════════════════════════════════
  const drawCategory = (cat: any, ci: number, sectionLabel?: string) => {
    const cands         = [...(cat.candidates || [])].sort((a:any,b:any)=>(b.vote_count||0)-(a.vote_count||0));
    const totalCatVotes = cands.reduce((s:number,c:any)=>s+(c.vote_count||0),0);
    const topVotes      = cands[0]?.vote_count || 0;
    const isTied        = cands.length > 1 &&
                          cands[0]?.vote_count === cands[1]?.vote_count &&
                          topVotes > 0;

    checkY(52);

    // Category header bar
    fill(C.navy);
    doc.roundedRect(ML, y, 3, 13, 1, 1, "F");

    // Number circle
    fill(C.slate);
    doc.circle(ML + 9, y + 6.5, 5, "F");
    color(C.white); font("bold", 8);
    doc.text(String(ci + 1), ML + 9, y + 8.8, { align: "center" });

    // Category name — full width, wrapping allowed
    color(C.dark); font("bold", 11);
    const catNameLines = doc.splitTextToSize(cat.name, CW - 55);
    doc.text(catNameLines, ML + 18, y + 5.5);

    // Group tags on category header
    if (cat.groups && cat.groups.length > 0) {
      const groupStr = cat.groups.map((g: any) => g.name).join(", ");
      color(C.purple); font("normal", 6.5);
      doc.text(`Groups: ${groupStr}`, ML + 18, y + 11);
    } else if (cat.is_global === false) {
      color(C.orange); font("normal", 6.5);
      doc.text("Group category", ML + 18, y + 11);
    } else if (sectionLabel) {
      color(C.teal); font("normal", 6.5);
      doc.text("General category", ML + 18, y + 11);
    }

    // Stats right
    color(C.gray); font("normal", 7);
    doc.text(
      `${cands.length} candidate${cands.length !== 1 ? "s" : ""}  ·  ${totalCatVotes.toLocaleString()} votes`,
      W - MR, y + 5.5, { align: "right" }
    );

    // Decided/Tied badge
    if (topVotes > 0) {
      const bl    = isTied ? "TIED" : "DECIDED";
      const bc    = isTied ? C.green : C.teal;
      fill(bc); doc.roundedRect(W - MR - 20, y + 7.5, 20, 5, 1, 1, "F");
      color(C.white); font("bold", 5.5);
      doc.text(bl, W - MR - 10, y + 11, { align: "center" });
    }

    y += 17;

    if (cands.length === 0) {
      color(C.gray); font("normal", 9);
      doc.text("No candidates recorded.", ML, y); y += 10; return;
    }

    // Table header
    fill(C.slate); doc.roundedRect(ML, y, CW, 8, 1, 1, "F");

    // Adjusted column widths — more space for name
    const cols = {
      rank:  { x: ML + 2,   w: 9   },
      name:  { x: ML + 13,  w: 80  },  // wider name column
      votes: { x: ML + 95,  w: 22  },
      share: { x: ML + 119, w: 20  },
      bar:   { x: ML + 141, w: CW - 141 - 1 },
    };

    color(C.white); font("bold", 7);
    doc.text("#",         cols.rank.x  + cols.rank.w/2,  y + 5.5, { align: "center" });
    doc.text("CANDIDATE", cols.name.x,                   y + 5.5);
    doc.text("VOTES",     cols.votes.x + cols.votes.w/2, y + 5.5, { align: "center" });
    doc.text("SHARE",     cols.share.x + cols.share.w/2, y + 5.5, { align: "center" });
    doc.text("PROGRESS",  cols.bar.x   + cols.bar.w/2,   y + 5.5, { align: "center" });
    y += 8;

    cands.forEach((c: any, i: number) => {
      checkY(11);
      const pct    = totalCatVotes > 0 ? (c.vote_count / totalCatVotes * 100) : 0;
      const isLead = c.vote_count === topVotes && topVotes > 0;
      const rowH   = 10;

      // Row bg
      if (isLead && !isTied)      fill(C.goldLight);
      else if (isLead && isTied)  fill(C.greenLight);
      else                        fill(i % 2 === 0 ? C.white : C.light);
      doc.rect(ML, y, CW, rowH, "F");

      // Leader accent
      if (isLead) {
        fill(isTied ? C.green : C.gold);
        doc.rect(ML, y, 2, rowH, "F");
      }

      // Rank
      if (isLead && !isTied) {
        fill(C.gold); doc.circle(cols.rank.x + cols.rank.w/2, y + rowH/2, 3.5, "F");
        color(C.white); font("bold", 7);
        doc.text("1", cols.rank.x + cols.rank.w/2, y + rowH/2 + 2.2, { align: "center" });
      } else {
        color(C.gray); font("normal", 8);
        doc.text(String(i+1), cols.rank.x + cols.rank.w/2, y + rowH/2 + 2.5, { align: "center" });
      }

      // Name — truncate to fit without wrapping
      color(isLead && !isTied ? "#92400e" : C.dark);
      font(isLead ? "bold" : "normal", 8.5);
      const nameStr = doc.splitTextToSize(c.name, cols.name.w - 2)[0];
      doc.text(nameStr, cols.name.x, y + rowH/2 + 2.5);

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
        fill(isLead && !isTied ? C.gold : isLead && isTied ? C.green : C.navy);
        doc.roundedRect(bx, by, fw, bh, 1, 1, "F");
      }

      stroke(C.border); doc.setLineWidth(0.15);
      doc.line(ML, y + rowH, W - MR, y + rowH);
      y += rowH;
    });

    // Winner callout
    if (topVotes > 0) {
      checkY(14); y += 3;
      const winPct  = totalCatVotes > 0 ? (topVotes / totalCatVotes * 100).toFixed(1) : "0.0";
      const bgColor = isTied ? C.greenLight : C.goldLight;
      const acColor = isTied ? C.green      : C.gold;
      const winnerNames = isTied
        ? cands.filter((c:any)=>c.vote_count===topVotes).map((c:any)=>c.name).join(" & ")
        : cands[0].name;
      const winText = isTied
        ? `TIED: ${winnerNames} — ${topVotes.toLocaleString()} votes each`
        : `WINNER: ${winnerNames} — ${topVotes.toLocaleString()} votes (${winPct}%)`;

      fill(bgColor); doc.roundedRect(ML, y, CW, 10, 2, 2, "F");
      fill(acColor); doc.roundedRect(ML, y, 3, 10, 1, 1, "F");
      stroke(acColor); doc.setLineWidth(0.3);
      doc.roundedRect(ML, y, CW, 10, 2, 2, "S");
      color(C.dark); font("bold", 8.5);
      doc.text(winText, ML + 7, y + 6.5, { maxWidth: CW - 10 });
      y += 14;
    } else {
      y += 5;
    }

    y += 5;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER CATEGORIES
  // ══════════════════════════════════════════════════════════════════════════

  if (isOrg && (globalCats.length > 0 || groupCats.length > 0)) {

    // ── General Categories section ──
    if (globalCats.length > 0) {
      checkY(16);
      // Section divider
      fill(C.navy); doc.roundedRect(ML, y, CW, 10, 2, 2, "F");
      fill(C.orange); doc.roundedRect(ML, y, 4, 10, 2, 2, "F");
      color(C.white); font("bold", 9);
      doc.text("GENERAL CATEGORIES", ML + 10, y + 7);
      color(C.grayLight); font("normal", 7);
      doc.text(`${globalCats.length} categor${globalCats.length !== 1 ? "ies" : "y"} — open to all voters`, W - MR, y + 7, { align: "right" });
      y += 14;

      globalCats.forEach((cat: any, ci: number) => drawCategory(cat, ci, "general"));
    }

    // ── Group Categories section ──
    if (groupCats.length > 0) {
      checkY(16);
      fill(C.purple); doc.roundedRect(ML, y, CW, 10, 2, 2, "F");
      fill(C.orange); doc.roundedRect(ML, y, 4, 10, 2, 2, "F");
      color(C.white); font("bold", 9);
      doc.text("GROUP CATEGORIES", ML + 10, y + 7);
      color(C.purpleLight); font("normal", 7);
      doc.text(`${groupCats.length} categor${groupCats.length !== 1 ? "ies" : "y"} — specific to voter groups`, W - MR, y + 7, { align: "right" });
      y += 14;

      groupCats.forEach((cat: any, ci: number) => drawCategory(cat, ci, "group"));
    }

  } else {
    // Standard election — render all categories normally
    categories.forEach((cat: any, ci: number) => drawCategory(cat, ci));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY TABLE
  // ══════════════════════════════════════════════════════════════════════════
  checkY(40);
  hline(y, C.border); y += 8;

  fill(C.slate); doc.roundedRect(ML, y, CW, 9, 2, 2, "F");
  color(C.white); font("bold", 10);
  doc.text("RESULTS SUMMARY", ML + CW/2, y + 6.5, { align: "center" });
  y += 13;

  // Build summary rows
  const buildSummaryRows = (cats: any[]) => cats.map((cat: any) => {
    const cands  = [...(cat.candidates||[])].sort((a:any,b:any)=>(b.vote_count||0)-(a.vote_count||0));
    const total  = cands.reduce((s:number,c:any)=>s+(c.vote_count||0),0);
    const topV   = cands[0]?.vote_count || 0;
    const isTied = cands.length > 1 && cands[0]?.vote_count === cands[1]?.vote_count && topV > 0;
    const winPct = total > 0 ? (topV / total * 100).toFixed(1) : "0.0";
    const winner = isTied
      ? `TIED: ${cands.filter((c:any)=>c.vote_count===topV).map((c:any)=>c.name).join(" & ")}`
      : (cands[0]?.name || "N/A");
    return { cat: cat.name, winner, votes: topV, pct: winPct, total, tied: isTied, isGlobal: cat.is_global !== false };
  });

  const allSummaryRows = buildSummaryRows(categories);

  // Summary header — adjusted columns
  fill(C.dark); doc.rect(ML, y, CW, 7, "F");
  color(C.white); font("bold", 7);
  // Cols: category(50), type(18), winner(60), votes(18), share(16), total(16)
  const sc = { cat: ML+2, type: ML+52, win: ML+72, votes: ML+134, share: ML+152, total: ML+166 };
  doc.text("CATEGORY",  sc.cat,   y+5);
  if (isOrg) doc.text("TYPE", sc.type, y+5);
  doc.text("WINNER / OUTCOME", sc.win,   y+5);
  doc.text("VOTES",     sc.votes, y+5);
  doc.text("SHARE",     sc.share, y+5);
  doc.text("TOTAL",     sc.total, y+5);
  y += 7;

  allSummaryRows.forEach((row, i) => {
    checkY(9);
    fill(i % 2 === 0 ? C.white : C.light);
    doc.rect(ML, y, CW, 8, "F");

    color(C.gray);  font("normal", 7);
    doc.text(doc.splitTextToSize(row.cat, 48)[0], sc.cat, y+5.5);

    if (isOrg) {
      color(row.isGlobal ? C.navy : C.purple); font("bold", 6);
      doc.text(row.isGlobal ? "GENERAL" : "GROUP", sc.type, y+5.5);
    }

    color(row.tied ? C.green : C.dark); font(row.tied ? "normal" : "bold", 7);
    doc.text(doc.splitTextToSize(row.winner, 58)[0], sc.win, y+5.5);

    color(C.dark); font("normal", 7);
    doc.text(String(row.votes), sc.votes+8, y+5.5, { align: "center" });

    color(row.tied ? C.green : C.gold); font("bold", 7);
    doc.text(`${row.pct}%`, sc.share+7, y+5.5, { align: "center" });

    color(C.gray); font("normal", 7);
    doc.text(String(row.total), sc.total+10, y+5.5, { align: "center" });

    stroke(C.border); doc.setLineWidth(0.15);
    doc.line(ML, y+8, W-MR, y+8);
    y += 8;
  });

  y += 10;

  // ── Confidential notice ──────────────────────────────────────────────────
  checkY(16);
  fill(C.light); doc.roundedRect(ML, y, CW, 12, 2, 2, "F");
  color(C.gray); font("normal", 7.5);
  doc.text(
    "This document is an official record generated by CelerVote. Results are encrypted and tamper-proof.",
    W/2, y + 5, { align: "center", maxWidth: CW - 10 }
  );
  color(C.grayLight); font("normal", 7);
  doc.text("Confidential — For authorised use only", W/2, y + 10, { align: "center" });

  drawFooter();

  const filename = `${event.slug || "results"}-report-${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(filename);
}