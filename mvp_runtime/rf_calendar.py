"""Offline federal five-day calendar. Never infer transfers for an unknown year."""
from calendar import monthrange
from datetime import date, datetime, timedelta

from .workspace import WorkspaceError

CALENDAR_VERSION = "rf-5day-2024-2027-v1"
CALENDAR_SOURCE = "https://www.cbr.ru/other/holidays/"
# Federal holidays and actual transfers, not a business-specific duty roster.
# RF decrees 1314/2023, 1335/2024, 1466/2025, 1187/2026. Reviewed 2026-11-23.
EXTRA_OFF = {
    2024: {"04-29", "04-30", "05-10", "12-30", "12-31"},
    2025: {"05-02", "05-08", "06-13", "11-03", "12-31"},
    2026: {"01-09", "03-09", "05-11", "12-31"},
    2027: {"02-22", "05-03", "05-10", "06-14", "11-05", "12-31"},
}
EXTRA_WORK = {2024: {"04-27", "11-02", "12-28"}, 2025: {"11-01"}, 2026: set(), 2027: {"02-20"}}
HOLIDAYS = {*(f"01-{day:02}" for day in range(1, 9)), "02-23", "03-08", "05-01", "05-09", "06-12", "11-04"}


def day_kind(day: date) -> str:
    if day.year not in EXTRA_OFF:
        raise WorkspaceError("calendar_year_unsupported")
    key = day.strftime("%m-%d")
    if key in EXTRA_WORK[day.year]: return "workday"
    if key in HOLIDAYS or key in EXTRA_OFF[day.year]: return "holiday"
    return "weekend" if day.weekday() >= 5 else "workday"


def period_bounds(filters: dict, now: datetime | None = None) -> tuple[datetime, datetime]:
    now = (now or datetime.now()).replace(tzinfo=None, microsecond=0)
    if filters.get("offhoursUntil"):
        try:
            fixed=datetime.strptime(filters["offhoursUntil"],"%Y-%m-%d %H:%M:%S")
            if fixed>now: raise ValueError
        except (ValueError,TypeError):
            raise WorkspaceError("db_filter_invalid") from None
        now=fixed
    period = filters.get("period") or "2m"
    if period == "2m":
        month_index = now.year * 12 + now.month - 3
        year, month = divmod(month_index, 12); month += 1
        start = datetime(year, month, min(now.day, monthrange(year, month)[1]))
        end = now
    elif period in ("today", "7d", "30d"):
        start = now.replace(hour=0, minute=0, second=0) if period == "today" else now - timedelta(days=int(period[:-1]))
        end = now
    elif period == "custom":
        try:
            start = datetime.strptime(filters["dateFrom"], "%Y-%m-%d")
            end = min(now, datetime.strptime(filters["dateTo"], "%Y-%m-%d") + timedelta(days=1))
        except (KeyError, TypeError, ValueError):
            raise WorkspaceError("db_filter_invalid") from None
    else:
        raise WorkspaceError("db_filter_invalid")
    if start >= end:
        raise WorkspaceError("offhours_period_invalid")
    # Reject the whole period if any federal year is not verified.
    for year in range(start.year, (end - timedelta(microseconds=1)).year + 1):
        if year not in EXTRA_OFF: raise WorkspaceError("calendar_year_unsupported")
    return start, end
