# Survey Data Converter

## User experience
- Add a protected, Arabic RTL page matching UECC Survey’s existing visual system, with separate field-data and office-data workflows.
- Require a chalet/villa identifier for every import/export, and keep the current project label prominent.
- Provide editable coordinate rows, duplicate/outlier cues, remove-duplicate action, E/N swap, optional elevation, numeric offsets, and a live 2D point plot.
- Retain the 10 most recent converted projects in browser storage for quick reload and re-export.

## Conversions
- Parse SDR/GSI and TXT/CSV/XLSX inputs in the browser; support pasted coordinate rows.
- Export field coordinates to a formatted Excel workbook, text, and lightweight point/label DXF.
- Export office coordinate data to SDR/GSI text formats, with configurable import/output format selection.

## Technical details
- Create a focused browser-safe coordinate-conversion utility and a TanStack Start route with route-specific metadata.
- Reuse the installed Excel libraries; dynamically load workbook libraries only during import/export to protect initial load and SSR.
- Add the route to the existing navigation and update project architecture notes and roadmap.
- Verify type checking, the preview page, representative import/parsing, and generated download content.
