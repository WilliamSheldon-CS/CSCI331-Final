const weekRange = document.getElementById("week-range");
const calendarGrid = document.getElementById("calendar-grid");
const timeColumn = document.getElementById("time-column");
const dayHeaderRow = document.getElementById("day-header-row");
const selectionDisplay = document.getElementById("selection-display");
const prevWeekBtn = document.getElementById("prev-week");
const nextWeekBtn = document.getElementById("next-week");
const checkoutBtn = document.getElementById("checkout-btn");
const checkoutList = document.getElementById("checkout-list");
const checkoutTotal = document.getElementById("checkout-total");

const START_HOUR = 6;
const END_HOUR = 22;
const SNAP = 5;
const TOP_PADDING = 20;
const BOTTOM_PADDING = 20;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

let currentDate = new Date();
let userSelections = {}; // local storage until checkout
const blockedPeriods = {}; // example: { "2025-12-05": [{start:"13:00",end:"14:00"}] }

/* -------------------- HELPERS -------------------- */
function parseTime(str) {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
}
function snapMin(min) {
    return Math.round(min / SNAP) * SNAP;
}
function fmt(min) {
    let h = Math.floor(min / 60);
    let m = min % 60;
    const am = h < 12;
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
function minutesToPixels(min, h) {
    const adj = h - TOP_PADDING - BOTTOM_PADDING;
    return TOP_PADDING + (adj * (min - START_HOUR * 60) / TOTAL_MINUTES);
}
function pixelsToMinutes(px, h) {
    const adj = h - TOP_PADDING - BOTTOM_PADDING;
    return START_HOUR * 60 + (TOTAL_MINUTES * (px - TOP_PADDING) / adj);
}
function overlaps(a1, a2, b1, b2) {
    return a1 < b2 && a2 > b1;
}
function clampY(y, h) {
    return Math.max(TOP_PADDING, Math.min(y, h - BOTTOM_PADDING));
}
function trimToBlocks(start, end, blocks) {
    let changed = true;
    while (changed) {
        changed = false;
        for (const b of blocks) {
            const bs = parseTime(b.start);
            const be = parseTime(b.end);
            if (overlaps(start, end, bs, be)) {
                if (start < bs && end > bs) {
                    end = bs;
                    changed = true;
                } else if (start >= bs && start < be) {
                    start = be;
                    changed = true;
                }
            }
        }
    }
    return { start, end };
}
function isInsideBlocked(min, blocks) {
    return blocks.some(b => {
        const bs = parseTime(b.start);
        const be = parseTime(b.end);
        return min >= bs && min < be;
    });
}

/* -------------------- RENDER WEEK -------------------- */
function renderWeek(date) {
    calendarGrid.innerHTML = "";
    timeColumn.innerHTML = "";
    dayHeaderRow.innerHTML = "";

    const startOfWeek = new Date(date);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    weekRange.textContent = `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;

    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);

        const header = document.createElement("div");
        header.className = "day-header";
        header.innerHTML = `${d.toLocaleDateString("en-US", { weekday: "short" })}<span class="comma">, </span><span class="month-day">${d.getMonth()+1}/${d.getDate()}</span>`;
        dayHeaderRow.appendChild(header);
    }

    const colHeight = 700;
    for (let h = START_HOUR; h <= END_HOUR; h++) {
        const lbl = document.createElement("div");
        lbl.className = "time-label";
        lbl.style.top = minutesToPixels(h * 60, colHeight) + "px";
        lbl.textContent = `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
        timeColumn.appendChild(lbl);
    }

    for (let i = 0; i < 7; i++) {
        const col = document.createElement("div");
        col.className = "day-column";
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        col.dataset.date = dateStr;

        calendarGrid.appendChild(col);
        if (!userSelections[dateStr]) userSelections[dateStr] = [];

        requestAnimationFrame(() => {
            restoreSelections(col, dateStr);
            enableInteractions(col);
        });
    }

    updateCheckout();
}

/* -------------------- RESTORE SELECTIONS -------------------- */
function restoreSelections(col, dateStr) {
    const list = userSelections[dateStr] || [];
    const colHeight = col.clientHeight;

    list.forEach(sel => {
        sel.element = document.createElement("div");
        sel.element.className = "selection-block";
        sel.element.style.top = minutesToPixels(sel.startMin, colHeight) + "px";
        sel.element.style.height = minutesToPixels(sel.endMin, colHeight) - minutesToPixels(sel.startMin, colHeight) + "px";
        col.appendChild(sel.element);
    });
}

function enableInteractions(col) {
    const dateStr = col.dataset.date;
    const blocks = blockedPeriods[dateStr] || [];

    let activeSelection = null;
    let dragStartY = 0;
    let isDragging = false;

    col.addEventListener("mousedown", e => {
        const colHeight = col.clientHeight;
        let y = clampY(e.offsetY, colHeight);
        let min = snapMin(pixelsToMinutes(y, colHeight));
        if (isInsideBlocked(min, blocks)) return;

        isDragging = true;
        dragStartY = y;

        activeSelection = document.createElement("div");
        activeSelection.className = "selection-block";
        activeSelection.style.top = y + "px";
        activeSelection.style.height = "0px";
        col.appendChild(activeSelection);
        document.body.style.userSelect = "none";
    });

    col.addEventListener("mousemove", e => {
        if (!isDragging || !activeSelection) return;
        const colHeight = col.clientHeight;
        let y = clampY(e.offsetY, colHeight);

        let top = Math.min(dragStartY, y);
        let bottom = Math.max(dragStartY, y);

        let startMin = snapMin(pixelsToMinutes(top, colHeight));
        let endMin = snapMin(pixelsToMinutes(bottom, colHeight));

        ({ start: startMin, end: endMin } = trimToBlocks(startMin, endMin, blocks));

        activeSelection.style.top = minutesToPixels(startMin, colHeight) + "px";
        activeSelection.style.height = minutesToPixels(endMin, colHeight) - minutesToPixels(startMin, colHeight) + "px";

        selectionDisplay.textContent = `${dateStr} — ${fmt(startMin)} to ${fmt(endMin)}`;
    });

    col.addEventListener("mouseup", e => {
        if (!isDragging || !activeSelection) return;
        isDragging = false;
        document.body.style.userSelect = "";

        const colHeight = col.clientHeight;
        let top = parseFloat(activeSelection.style.top);
        let height = parseFloat(activeSelection.style.height);
        let bottom = top + height;

        let startMin = snapMin(pixelsToMinutes(top, colHeight));
        let endMin = snapMin(pixelsToMinutes(bottom, colHeight));

        const list = userSelections[dateStr] || (userSelections[dateStr] = []);

        const overlapping = list.filter(sel => overlaps(startMin, endMin, sel.startMin, sel.endMin));
        overlapping.forEach(sel => sel.element.remove());
        userSelections[dateStr] = list.filter(sel => !overlapping.includes(sel));

        if (startMin >= endMin) { activeSelection.remove(); activeSelection = null; return; }

        userSelections[dateStr].push({ startMin, endMin, element: activeSelection });
        activeSelection = null;
        updateCheckout();
    });

    col.addEventListener("dblclick", e => {
        const list = userSelections[dateStr] || [];
        const colHeight = col.clientHeight;
        const y = e.offsetY;
        const min = pixelsToMinutes(y, colHeight);

        const match = list.find(sel => min >= sel.startMin && min < sel.endMin);
        if (!match) return;

        match.element.remove();
        userSelections[dateStr] = list.filter(s => s !== match);
        updateCheckout();
    });
}

/* -------------------- CHECKOUT DISPLAY -------------------- */
function updateCheckout() {
    checkoutList.innerHTML = "";
    let totalCount = 0;

    for (const date in userSelections) {
        for (const sel of userSelections[date]) {
            const li = document.createElement("li");

            const text = document.createElement("span");
            text.textContent = `${date} — ${fmt(sel.startMin)} to ${fmt(sel.endMin)}`;
            li.appendChild(text);

            const removeBtn = document.createElement("button");
            removeBtn.textContent = "✕";
            removeBtn.style.marginLeft = "10px";
            removeBtn.style.cursor = "pointer";
            removeBtn.addEventListener("click", () => {
                sel.element.remove(); 
                userSelections[date] = userSelections[date].filter(s => s !== sel);
                updateCheckout(); 
            });

            li.appendChild(removeBtn);
            checkoutList.appendChild(li);

            totalCount++;
        }
    }

    checkoutTotal.textContent = `Total: ${totalCount} booking${totalCount !== 1 ? "s" : ""}`;
}


/* -------------------- CHECKOUT BUTTON -------------------- */
if (checkoutBtn) {
    checkoutBtn.addEventListener("click", async () => {
        const payload = [];

        for (const date in userSelections) {
            for (const sel of userSelections[date]) {
                payload.push({
                    date,
                    startMin: sel.startMin,
                    endMin: sel.endMin
                });
            }
        }

        if (!payload.length) {
            alert("No bookings to save.");
            return;
        }

        try {
            const res = await fetch("../CSCI331-FinalProject/api/save.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success) {
                alert("Bookings successfully saved!");
            } else {
                alert("Failed to save bookings.");
            }

            userSelections = {};
            renderWeek(currentDate);
            updateCheckout();
        } catch (err) {
            console.error("Checkout failed:", err);
            alert("Error saving bookings. See console for details.");
        }
    });
}

prevWeekBtn.onclick = () => { currentDate.setDate(currentDate.getDate() - 7); renderWeek(currentDate); };
nextWeekBtn.onclick = () => { currentDate.setDate(currentDate.getDate() + 7); renderWeek(currentDate); };

renderWeek(currentDate);
updateCheckout();
