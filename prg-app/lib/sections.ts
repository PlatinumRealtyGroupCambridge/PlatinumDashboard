export type Section = {
  id: string;
  label: string;
  color: string; // CSS var name, e.g. "series-blue"
  blurb: string;
  live?: boolean;
  href: string;
};

// Mirrors the SECTIONS array from the validated prototype — 8 fixed
// categorical color slots assigned in order, never cycled.
export const SECTIONS: Section[] = [
  {
    id: "ceo",
    label: "CEO Dashboard",
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
  {
    id: "meetings",
    label: "Meeting Management",
    color: "series-orange",
    blurb: "Leadership & team meetings, 1-on-1s, to-dos, and goals.",
    live: true,
    href: "/meetings",
  },
];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);

export const ZOOM_LINK =
  "https://us06web.zoom.us/j/2270479488?pwd=T3hUdVNLcjUrWTl4SFd0bGl2aTBUUT09";
