export type Section = {
  id: string;
  label: string;
  color: string; // CSS var name, e.g. "series-blue"
  blurb: string;
  live?: boolean;
  href: string;
};

// The 7 KPI dashboards — one fixed categorical color slot each, assigned in
// order, never cycled.
export const DASHBOARD_SECTIONS: Section[] = [
  {
    id: "ceo",
    label: "Tim Dashboard",
    color: "series-blue",
    blurb:
      "A roll-up view across finance, marketing, leasing, operations, and sales — the numbers that matter most across the whole company.",
    href: "/ceo",
  },
  {
    id: "financial",
    label: "Financial Dashboard",
    color: "series-aqua",
    blurb: "Revenue, expenses, cash flow, and owner distributions, pulled from QuickBooks Online.",
    href: "/financial",
  },
  {
    id: "trust",
    label: "Trust Accounting Dashboard",
    color: "series-yellow",
    blurb: "Trust account balances, reconciliations, and compliance tracking, from Rentvine.",
    href: "/trust",
  },
  {
    id: "marketing",
    label: "Marketing Dashboard",
    color: "series-green",
    blurb: "Lead sources, conversion rates, and campaign performance.",
    href: "/marketing",
  },
  {
    id: "leasing",
    label: "Leasing Dashboard",
    color: "series-violet",
    blurb: "Vacancy, applications, lease renewals, and time-to-lease, from Rentvine and Aptly.",
    href: "/leasing",
  },
  {
    id: "operations",
    label: "Operations Dashboard",
    color: "series-red",
    blurb: "Maintenance requests, response times, and vendor performance.",
    href: "/operations",
  },
  {
    id: "sales",
    label: "Sales Dashboard",
    color: "series-magenta",
    blurb: "New business pipeline and closed deals.",
    href: "/sales",
  },
];

// Meeting Management, To-Dos, and Goals are one functional family (the
// EOS/meetings module), so they share the remaining categorical slot
// (orange) rather than borrowing a hue that "belongs" to one of the KPI
// dashboards above.
export const TEAM_SECTIONS: Section[] = [
  {
    id: "meetings",
    label: "Meeting Management",
    color: "series-orange",
    blurb: "Leadership & team meetings and 1-on-1s, with live agendas.",
    live: true,
    href: "/meetings",
  },
  {
    id: "todos",
    label: "To-Dos",
    color: "series-orange",
    blurb: "Tasks owned by each team member, whether created directly or from a meeting.",
    live: true,
    href: "/todos",
  },
  {
    id: "goals",
    label: "Goals",
    color: "series-orange",
    blurb: "Longer-horizon goals, owned by a person, tracked to a target date.",
    live: true,
    href: "/goals",
  },
];

export const ALL_SECTIONS: Section[] = [...DASHBOARD_SECTIONS, ...TEAM_SECTIONS];

export const sectionById = (id: string) => ALL_SECTIONS.find((s) => s.id === id);

export const ZOOM_LINK =
  "https://us06web.zoom.us/j/2270479488?pwd=T3hUdVNLcjUrWTl4SFd0bGl2aTBUUT09";
