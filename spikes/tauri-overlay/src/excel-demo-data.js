// Isolated Excel demo harness — fake Research + fake plan_step.
// Never imported by sidebar.js. Atlas coords are a 1920×1080 Excel window.

const REF_W = 1920;
const REF_H = 1080;

function bbox(x0, y0, x1, y1) {
  return { x0, y0, x1, y1, image_width: REF_W, image_height: REF_H, anchor: { kind: "window", label: "Excel" } };
}

function mark(x0, y0, x1, y1, title, text) {
  return { bbox: bbox(x0, y0, x1, y1), title, text };
}

const ATLAS = {
  insertTab: (t) => mark(148, 40, 220, 74, "Insert tab", t),
  homeTab: (t) => mark(76, 40, 140, 74, "Home tab", t),
  dataTab: (t) => mark(300, 40, 370, 74, "Data tab", t),
  ribbon: (t) => mark(76, 76, 1700, 170, "Ribbon", t),
  nameBox: (t) => mark(10, 174, 96, 204, "Name Box", t),
  formulaBar: (t) => mark(104, 174, 1880, 204, "Formula bar", t),
  headers: (t) => mark(48, 236, 280, 268, "Header row", t),
  columns: (t) => mark(48, 208, 280, 236, "Column letters", t),
  grid: (t) => mark(48, 236, 280, 460, "Data range", t),
  recCharts: (t) => mark(480, 84, 720, 162, "Recommended Charts", t),
  chartArea: (t) => mark(520, 280, 1400, 820, "Chart area", t),
  pivot: (t) => mark(220, 84, 400, 162, "PivotTable", t),
  filter: (t) => mark(160, 84, 280, 162, "Filter", t),
  sort: (t) => mark(290, 84, 400, 162, "Sort", t),
  fx: (t) => mark(80, 174, 104, 204, "Insert function", t),
  freeze: (t) => mark(820, 84, 980, 162, "Freeze Panes", t),
  viewTab: (t) => mark(560, 40, 640, 74, "View tab", t),
  status: (t) => mark(16, 1048, 140, 1072, "Status bar", t),
  expand: (t) => mark(1820, 40, 1900, 74, "Expand ribbon", t),
};

const RECIPES = [
  {
    id: "chart",
    keywords: ["chart", "graph", "plot", "column", "bar", "line", "pie"],
    title: () => "Make a chart",
    steps: [
      {
        title: () => "Select the data",
        brief: "Include headers so the legend is labeled.",
        watch_for: "A single cell makes Insert Chart guess — or refuse.",
        substeps: (goal) => [
          {
            target: "the data table including headers",
            text: "Select the table — headers in row 1.",
            overlays: [
              ATLAS.grid("Drag the block Excel should plot."),
              ATLAS.nameBox("First click should read A1."),
              ATLAS.columns("These columns become the series."),
            ],
          },
          {
            target: "the header row",
            text: "Check row 1 has labels — those become the legend.",
            overlays: [
              ATLAS.headers("These names show on the chart."),
              ATLAS.formulaBar("A header cell echoes here."),
              ATLAS.status("Ready means the sheet is idle."),
            ],
          },
        ],
      },
      {
        title: () => "Insert a recommended chart",
        brief: "Open Insert and let Excel pick a chart for the selection.",
        watch_for: "A collapsed ribbon hides the Charts group.",
        substeps: () => [
          {
            target: "the Insert tab",
            text: "Click Insert — between Home and Page Layout.",
            overlays: [
              ATLAS.insertTab("Click Insert to show charts."),
              ATLAS.homeTab("Not Home — that's fonts and fill."),
              ATLAS.ribbon("The Charts group appears on this row."),
            ],
          },
          {
            target: "Recommended Charts",
            text: "Click Recommended Charts, then the clustered column.",
            overlays: [
              ATLAS.recCharts("Preview uses the range you selected."),
              ATLAS.chartArea("The new chart lands on the sheet here."),
              ATLAS.expand("Use this if you only see tab names."),
            ],
          },
        ],
      },
      {
        title: () => "Check the chart against the table",
        brief: "Title and series should match the headers you selected.",
        watch_for: "Click the chart if Chart Design is missing.",
        substeps: (goal) => [
          {
            target: "the new chart",
            text: "Confirm the title and series match the headers you selected.",
            overlays: [
              ATLAS.chartArea("Click the chart to select it."),
              ATLAS.grid("Still bound to this table."),
              ATLAS.status("Watch for errors after insert."),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "pivot",
    keywords: ["pivot", "summarize", "aggregate", "group by"],
    title: () => "Build a PivotTable",
    steps: [
      {
        title: () => "Select the table",
        brief: "One header row, no blank columns in the middle.",
        watch_for: "Merged header cells break the field list.",
        substeps: () => [
          {
            target: "the source table",
            text: "Select every column the PivotTable should see.",
            overlays: [
              ATLAS.grid("Include headers and all value rows."),
              ATLAS.headers("Each header becomes a pivot field."),
              ATLAS.nameBox("A1 is a safe first cell."),
            ],
          },
        ],
      },
      {
        title: () => "Insert a PivotTable",
        brief: "Insert → PivotTable, new worksheet is fine.",
        watch_for: "Excel 365 also offers PivotTable from the Data tab.",
        substeps: () => [
          {
            target: "the Insert tab",
            text: "Click Insert, then PivotTable on the far left of the ribbon.",
            overlays: [
              ATLAS.insertTab("Open Insert."),
              ATLAS.pivot("PivotTable is in Tables."),
              ATLAS.ribbon("Stay on this row after Insert is selected."),
            ],
          },
        ],
      },
      {
        title: () => "Drop fields into Rows and Values",
        brief: "Categories in Rows, numbers in Values.",
        watch_for: "Text in Values becomes Count, not Sum.",
        substeps: () => [
          {
            target: "the PivotTable Fields pane",
            text: "Drag a category to Rows and a number to Values.",
            overlays: [
              ATLAS.chartArea("The pivot canvas fills this side."),
              ATLAS.grid("The source table stays on the other sheet."),
              ATLAS.status("Count vs Sum shows here on the value field."),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "filter",
    keywords: ["filter", "autofilter", "hide rows", "dropdown"],
    title: () => "Filter a table",
    steps: [
      {
        title: () => "Select the header row",
        brief: "AutoFilter wants a header in the first row of the block.",
        watch_for: "A table already has filter arrows — don't stack them.",
        substeps: () => [
          {
            target: "the header row",
            text: "Click any header cell in the table you want to filter.",
            overlays: [
              ATLAS.headers("Filter arrows will sit on these cells."),
              ATLAS.grid("The rows below are what gets hidden."),
              ATLAS.nameBox("Confirms which header is active."),
            ],
          },
        ],
      },
      {
        title: () => "Turn on Filter",
        brief: "Data → Filter, or Home → Sort & Filter.",
        watch_for: "If the ribbon is collapsed, click Data twice.",
        substeps: () => [
          {
            target: "the Data tab Filter button",
            text: "Click Data, then Filter so arrows appear on each header.",
            overlays: [
              ATLAS.dataTab("Open the Data tab."),
              ATLAS.filter("Filter toggles the arrows."),
              ATLAS.headers("Arrows appear on this row."),
            ],
          },
        ],
      },
      {
        title: () => "Narrow the list",
        brief: "Uncheck the values you don't want.",
        watch_for: "Clear Filter on that column to get rows back.",
        substeps: () => [
          {
            target: "a column filter arrow",
            text: "Click an arrow and leave only the values you need.",
            overlays: [
              ATLAS.headers("Each arrow is one column."),
              ATLAS.grid("Hidden rows disappear from this block."),
              ATLAS.status("Filter count shows on the status bar."),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "lookup",
    keywords: ["vlookup", "xlookup", "lookup", "match", "index"],
    title: () => "Look up a value",
    steps: [
      {
        title: () => "Click the cell that should hold the answer",
        brief: "Lookups write into one cell, then you fill down.",
        watch_for: "Don't start inside the lookup table itself.",
        substeps: () => [
          {
            target: "the result cell",
            text: "Click the empty cell to the right of the table.",
            overlays: [
              ATLAS.nameBox("This should show the result cell address."),
              ATLAS.formulaBar("The formula will appear here."),
              ATLAS.grid("The table you search stays selected only for the range."),
            ],
          },
        ],
      },
      {
        title: () => "Build XLOOKUP or VLOOKUP",
        brief: "fx → XLOOKUP if you have it, otherwise VLOOKUP.",
        watch_for: "VLOOKUP needs the key in the leftmost column.",
        substeps: () => [
          {
            target: "Insert Function",
            text: "Click fx, pick XLOOKUP, and point at the lookup value and return column.",
            overlays: [
              ATLAS.fx("Opens the function wizard."),
              ATLAS.formulaBar("Arguments land here as you click ranges."),
              ATLAS.grid("Click the lookup column, then the return column."),
            ],
          },
        ],
      },
      {
        title: () => "Fill the formula down",
        brief: "Double-click the fill handle if the column is contiguous.",
        watch_for: "Lock table ranges with $ before filling.",
        substeps: () => [
          {
            target: "the fill handle",
            text: "Fill down so every row gets its own lookup.",
            overlays: [
              ATLAS.grid("The formula copies beside this table."),
              ATLAS.status("Watch for #N/A — that's a missing key."),
              ATLAS.formulaBar("Check $ locks before you fill."),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "format",
    keywords: ["conditional", "highlight", "color scale", "heatmap", "format"],
    title: () => "Format the numbers",
    steps: [
      {
        title: () => "Select the numbers",
        brief: "Conditional formatting applies to the current selection.",
        watch_for: "Don't include the header row unless you mean to.",
        substeps: () => [
          {
            target: "the value cells",
            text: "Select the numbers only — skip the header.",
            overlays: [
              ATLAS.grid("Highlight the value block."),
              ATLAS.headers("Leave this row out of the selection."),
              ATLAS.nameBox("The range address should start at row 2."),
            ],
          },
        ],
      },
      {
        title: () => "Apply a color scale or rule",
        brief: "Home → Conditional Formatting → Color Scales.",
        watch_for: "Manage Rules if an old rule is still on the sheet.",
        substeps: () => [
          {
            target: "Conditional Formatting on the Home tab",
            text: "Home → Conditional Formatting → Color Scales → green-yellow-red.",
            overlays: [
              ATLAS.homeTab("Conditional Formatting lives on Home."),
              ATLAS.ribbon("The Styles group is on this row."),
              ATLAS.grid("The scale paints this block immediately."),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "freeze",
    keywords: ["freeze", "lock row", "sticky header", "panes"],
    title: () => "Freeze the header row",
    steps: [
      {
        title: () => "Click the cell below and right of what should stay",
        brief: "Freeze Panes freezes everything above and left of the active cell.",
        watch_for: "Cell A2 freezes row 1 only.",
        substeps: () => [
          {
            target: "cell A2",
            text: "Click A2 to freeze the header row.",
            overlays: [
              ATLAS.nameBox("Should read A2."),
              ATLAS.headers("This row will stay put."),
              ATLAS.grid("Everything from row 2 down will scroll."),
            ],
          },
        ],
      },
      {
        title: () => "Freeze Panes",
        brief: "View → Freeze Panes → Freeze Panes.",
        watch_for: "Unfreeze Panes is in the same menu.",
        substeps: () => [
          {
            target: "Freeze Panes on the View tab",
            text: "View → Freeze Panes → Freeze Panes.",
            overlays: [
              ATLAS.viewTab("Open View."),
              ATLAS.freeze("Freeze Panes is in Window."),
              ATLAS.headers("A thin line appears under this row."),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "sort",
    keywords: ["sort", "ascending", "descending", "a to z"],
    title: () => "Sort the table",
    steps: [
      {
        title: () => "Select the table, headers included",
        brief: "Sort needs the full block so rows stay together.",
        watch_for: "Selecting one column can sort that column alone and scramble rows.",
        substeps: () => [
          {
            target: "the whole table",
            text: "Select headers plus every data row.",
            overlays: [
              ATLAS.grid("The whole block, not one column."),
              ATLAS.headers("My data has headers should be on."),
              ATLAS.columns("Every column in the sort must be inside this span."),
            ],
          },
        ],
      },
      {
        title: () => "Sort from the Data tab",
        brief: "Data → Sort opens the dialog if you need more than one key.",
        watch_for: "A to Z on the ribbon is a single-column shortcut.",
        substeps: () => [
          {
            target: "the Sort button",
            text: "Data → Sort, pick the column, A to Z or Z to A.",
            overlays: [
              ATLAS.dataTab("Open Data."),
              ATLAS.sort("Sort opens the multi-key dialog."),
              ATLAS.grid("Rows rearrange inside this block."),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "generic",
    keywords: [],
    title: () => "Work in the sheet",
    steps: [
      {
        title: () => "Select the working range",
        brief: "Most Excel work starts by selecting the sheet area you care about.",
        watch_for: "The ribbon changes with the tab — look at Home, Insert, or Data first.",
        substeps: () => [
          {
            target: "the working range",
            text: "Select the cells this step needs.",
            overlays: [
              ATLAS.grid("Start with the table on the sheet."),
              ATLAS.nameBox("Confirms the active cell."),
              ATLAS.ribbon("The next control will be on this row."),
            ],
          },
        ],
      },
      {
        title: () => "Use the ribbon command",
        brief: "Pick the tab that matches the job, then the button in that group.",
        watch_for: "If the button is missing, expand the ribbon.",
        substeps: () => [
          {
            target: "the ribbon tab for this task",
            text: "Open the matching tab, then click the command.",
            overlays: [
              ATLAS.homeTab("Home is formatting and clipboard."),
              ATLAS.insertTab("Insert is charts, tables, pictures."),
              ATLAS.dataTab("Data is sort, filter, and connections."),
              ATLAS.expand("Restore the ribbon if only tabs are showing."),
            ],
          },
        ],
      },
      {
        title: () => "Check the sheet changed the way you expected",
        brief: "Undo is Ctrl+Z / ⌘Z if the wrong range was selected.",
        watch_for: "The status bar often reports counts after a command.",
        substeps: () => [
          {
            target: "the sheet and status bar",
            text: "Look at the sheet and the status bar before moving on.",
            overlays: [
              ATLAS.grid("The table should reflect the command."),
              ATLAS.status("Ready, or a count, means Excel finished."),
              ATLAS.formulaBar("Formulas and values show here."),
            ],
          },
        ],
      },
    ],
  },
];

export function pickExcelRecipe(goal) {
  const hay = String(goal || "").toLowerCase();
  let best = RECIPES[RECIPES.length - 1];
  let score = -1;
  for (const recipe of RECIPES) {
    if (!recipe.keywords.length) continue;
    const hits = recipe.keywords.filter((k) => hay.includes(k)).length;
    if (hits > score) {
      score = hits;
      best = recipe;
    }
  }
  return best;
}

export function researchExcel(goal) {
  const recipe = pickExcelRecipe(goal);
  return {
    id: `excel-demo-${Date.now()}`,
    source: "excel-demo",
    recipeId: recipe.id,
    title: recipe.title(goal),
    goal,
    appName: "Excel",
    steps: recipe.steps.map((step, i) => ({
      id: `s${i + 1}`,
      title: typeof step.title === "function" ? step.title(goal) : step.title,
      brief: step.brief,
      watch_for: step.watch_for,
      generated: false,
      substeps: [],
    })),
  };
}

export function planExcelStep(skill, step) {
  const recipe = RECIPES.find((r) => r.id === skill.recipeId) || RECIPES[RECIPES.length - 1];
  const index = skill.steps.indexOf(step);
  const spec = recipe.steps[index] || recipe.steps[0];
  return spec.substeps(skill.goal).map((sub, i) => ({
    id: `${step.id}-${i + 1}`,
    origin: "ai",
    target_description: sub.target,
    instruction_text: sub.text,
    action: "click",
    last_known_bbox: sub.overlays[0]?.bbox ?? null,
    overlays: sub.overlays,
  }));
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const EXCEL_HINTS = [
  "excel", "spreadsheet", "xlsx", "workbook", "worksheet",
  "vlookup", "xlookup", "pivot", "formula", "cell", "column", "sheet",
];

export function looksLikeExcel(goal, windowInfo) {
  const hay = `${goal || ""} ${windowInfo?.app_name || ""} ${windowInfo?.title || ""}`.toLowerCase();
  if (EXCEL_HINTS.some((k) => hay.includes(k))) return true;
  if (/excel/i.test(windowInfo?.app_name || "")) return true;
  return RECIPES.some((r) => r.keywords.some((k) => k && hay.includes(k)));
}

export const PREVIOUS_APPS = [
  {
    id: "premiere",
    title: "Premiere Pro",
    icon: "assets/premiere-pro.svg",
    skills: [
      {
        title: "Cut a talking-head clip",
        goal: "Trim the interview down to 30 seconds",
        steps: [
          { title: "Select the clip on the timeline", brief: "Click the clip you want to shorten." },
          { title: "Ripple-delete the tail", brief: "Cut at the playhead, then remove the leftover." },
        ],
        overlays: [
          [mark(80, 820, 1760, 1000, "Timeline", "Click the talking-head clip on V1."), mark(40, 40, 220, 90, "Selection tool", "Press V so you are in Selection.")],
          [mark(900, 820, 980, 1000, "Playhead", "Park the playhead where the clip should end."), mark(80, 820, 1760, 1000, "Timeline", "Press W to ripple-trim to the playhead.")],
        ],
      },
      {
        title: "Add a cross dissolve",
        goal: "Smooth the cut between two clips",
        steps: [
          { title: "Find the edit point", brief: "Zoom the timeline until the cut is obvious." },
          { title: "Drop the dissolve", brief: "Apply Cross Dissolve on the cut." },
        ],
        overlays: [
          [mark(720, 820, 820, 1000, "Edit point", "Click the cut between the two clips."), mark(40, 40, 180, 90, "Effects", "Open Effects if the panel is hidden.")],
          [mark(240, 120, 520, 400, "Video Transitions", "Drag Cross Dissolve onto the cut."), mark(720, 820, 900, 1000, "Transition", "The pink bar is the dissolve — drag to change length.")],
        ],
      },
      {
        title: "Export for YouTube",
        goal: "H.264 1080p upload",
        steps: [
          { title: "Open Export", brief: "File → Export → Media, or Cmd/Ctrl+M." },
          { title: "Pick the YouTube preset", brief: "Match Source — High Bitrate is fine." },
        ],
        overlays: [
          [mark(16, 8, 70, 36, "File menu", "Open File → Export → Media."), mark(80, 820, 1760, 1000, "Sequence", "The In/Out range is what will export.")],
          [mark(420, 160, 1500, 860, "Export settings", "Choose YouTube 1080p HD."), mark(1600, 980, 1880, 1050, "Export", "Click Export and wait for the encode.")],
        ],
      },
    ],
  },
  {
    id: "photoshop",
    title: "Photoshop",
    icon: "assets/photoshop.svg",
    skills: [
      {
        title: "Remove a background",
        goal: "Cut the subject out of a busy photo",
        steps: [
          { title: "Select the subject", brief: "Let Photoshop find the person or product." },
          { title: "Mask, don't erase", brief: "Turn the selection into a layer mask." },
        ],
        overlays: [
          [mark(420, 40, 620, 80, "Select", "Open Select → Subject."), mark(48, 120, 360, 900, "Layers", "Work on a duplicate so the original stays safe.")],
          [mark(48, 120, 360, 220, "Layer mask", "Click Add layer mask at the bottom of Layers."), mark(400, 160, 1500, 900, "Canvas", "Alt/Option-click the mask to refine edges.")],
        ],
      },
      {
        title: "Match color across shots",
        goal: "Make two photos look like the same light",
        steps: [
          { title: "Open both images", brief: "The reference shot stays visible." },
          { title: "Apply Match Color", brief: "Image → Adjustments → Match Color." },
        ],
        overlays: [
          [mark(16, 8, 70, 36, "File menu", "Open the reference photo next to the one you are fixing."), mark(400, 160, 1500, 900, "Canvas", "Click the photo that should change.")],
          [mark(16, 8, 180, 36, "Image menu", "Image → Adjustments → Match Color."), mark(520, 200, 1100, 720, "Match Color", "Set Source to the reference file, then fade.")],
        ],
      },
      {
        title: "Export a web-ready PNG",
        goal: "Small file, sharp edges",
        steps: [
          { title: "Crop to the artwork", brief: "Trim empty canvas first." },
          { title: "Export As PNG", brief: "File → Export → Export As." },
        ],
        overlays: [
          [mark(220, 40, 320, 80, "Crop tool", "Press C, then drag tight around the artwork."), mark(400, 160, 1500, 900, "Canvas", "Enter to apply the crop.")],
          [mark(16, 8, 70, 36, "File menu", "File → Export → Export As…"), mark(520, 180, 1200, 800, "Export As", "PNG-24, transparency on, then Export.")],
        ],
      },
    ],
  },
  {
    id: "blender",
    title: "Blender",
    icon: "assets/blender.svg",
    skills: [
      {
        title: "Add a subdivision surface",
        goal: "Smooth a blocky mesh without extra verts",
        steps: [
          { title: "Select the object", brief: "Click the mesh in the viewport or Outliner." },
          { title: "Add the modifier", brief: "Subdivision Surface on the Modifier stack." },
        ],
        overlays: [
          [mark(480, 80, 1500, 900, "Viewport", "Click the object you want to smooth."), mark(8, 80, 220, 520, "Outliner", "Or pick it by name in the Outliner.")],
          [mark(8, 560, 280, 1040, "Modifiers", "Add Modifier → Subdivision Surface."), mark(480, 80, 1500, 900, "Viewport", "Levels Viewport 2 is enough to check the look.")],
        ],
      },
      {
        title: "Set up a camera shot",
        goal: "Frame the hero object and lock the view",
        steps: [
          { title: "Add a camera", brief: "Shift+A → Camera, then place it." },
          { title: "Look through it", brief: "Numpad 0, then Lock Camera to View if you want to fly." },
        ],
        overlays: [
          [mark(480, 80, 1500, 900, "Viewport", "Shift+A → Camera, then G to move it."), mark(8, 80, 220, 200, "Add menu", "Add lives in the top-left of the viewport.")],
          [mark(480, 80, 1500, 900, "Camera view", "Press Numpad 0 to look through the camera."), mark(1640, 80, 1900, 200, "View", "View → Cameras → Lock Camera to View.")],
        ],
      },
      {
        title: "Render a still",
        goal: "F12 PNG of the current camera",
        steps: [
          { title: "Pick the engine", brief: "Eevee is fast; Cycles if you need the light." },
          { title: "Render image", brief: "Render → Render Image, then save." },
        ],
        overlays: [
          [mark(8, 40, 280, 200, "Render properties", "Open the camera tab and set Engine."), mark(1640, 80, 1900, 360, "Output", "Set Resolution and the output folder.")],
          [mark(16, 8, 90, 36, "Render menu", "Render → Render Image (F12)."), mark(520, 180, 1400, 900, "Image editor", "Image → Save As to write the PNG.")],
        ],
      },
    ],
  },
];

export function cannedPreviousSkill(app, spec) {
  return {
    id: `${app.id}-${spec.title.replace(/\s+/g, "-").toLowerCase()}`,
    source: "previous",
    recipeId: app.id,
    title: spec.title,
    goal: spec.goal,
    appName: app.title,
    steps: spec.steps.map((step, i) => ({
      id: `s${i + 1}`,
      title: step.title,
      brief: step.brief,
      generated: true,
      substeps: (spec.overlays[i] || []).map((overlay, j) => ({
        id: `s${i + 1}-${j + 1}`,
        origin: "ai",
        target_description: overlay.title,
        instruction_text: overlay.text,
        action: "click",
        last_known_bbox: overlay.bbox,
        overlays: [overlay],
      })),
    })),
  };
}
