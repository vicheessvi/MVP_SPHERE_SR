# Tasks: CloudLink 300 log analytics

- [x] T001 Add separate bounded streaming parser for exact 300 XML log boot markers and candidate gaps.
- [x] T002 Add exact SR/model/format import gates, separate Bar/Box indices and deterministic cross-export dedup.
- [x] T003 Integrate Bar observations and Box preliminary reports into both analysis tabs; preserve confidence and donut/heatmap denominator.
- [x] T004 Add paired positive/negative regression scenarios for format, IP, model, duplicate exports, boot, gap and no false confirmed events.
- [x] T005 Update product reference, context map and ADR with evidence boundary.
- [x] T006 Run JS/Python tests, validate no sensitive files or temporary probe remain.
- [x] T007 Compare user-controlled Bar 300 restart and shutdown with read-only full journals; add only the exact validated web-shutdown rule and retain unknown reboot cause.
- [x] T008 Record the administrator's separate validation of Box 300 and Box 600, include their new events in aggregate duration/heatmap analytics with exact model gates and model-specific rule versions, and update tests/docs. A distinguishing reboot marker remains unknown and is not invented.
