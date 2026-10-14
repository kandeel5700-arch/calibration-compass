# Project rules
- Attendance day details reuse loaded attendance, schedule, and salary data and the existing admin edit/add dialogs; this keeps permissions and calculations consistent across views.
- Attendance exports use a shared browser-safe report model and the existing computeSession rules; this keeps Excel, PDF and displayed payroll totals consistent without changing payroll logic.
- Load ExcelJS and PDF export libraries only when exporting; this keeps the attendance page lightweight and SSR safe.