export type Ticket = {
  id: string;
  subject: string;
  status: "open" | "in_progress" | "pending_customer" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  customerId: string;
  createdAt: string;
  notes: string;
};

export type Asset = {
  assetId: string;
  name: string;
  type: string;
  status: "active" | "maintenance" | "decommissioned" | "spare";
  assignedTo: string;
  location: string;
};

export type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  tier: "standard" | "premium" | "enterprise";
  activeTickets: number;
};

// ---- Tickets ----

const TICKETS: Record<string, Ticket> = {
  "INC-4471": {
    id: "INC-4471",
    subject: "VPN connectivity dropping intermittently for remote staff",
    status: "in_progress",
    priority: "high",
    customerId: "CUST-001",
    createdAt: "2025-06-24T08:15:00Z",
    notes: "Affects 12 remote employees at Al Tayer Group. FortiClient logs show TLS handshake timeouts. Engineer assigned: Khalid Mansouri.",
  },
  "INC-4472": {
    id: "INC-4472",
    subject: "HP LaserJet printer offline on Floor 3",
    status: "open",
    priority: "medium",
    customerId: "CUST-002",
    createdAt: "2025-06-25T10:30:00Z",
    notes: "Printer shows offline in Windows print queue. Device is powered on. IP conflict suspected — DHCP scope may need review.",
  },
  "INC-4473": {
    id: "INC-4473",
    subject: "Microsoft 365 email sync failure on mobile devices",
    status: "pending_customer",
    priority: "medium",
    customerId: "CUST-003",
    createdAt: "2025-06-22T14:00:00Z",
    notes: "Modern Authentication policy change broke ActiveSync for iOS. Awaiting customer to confirm MFA re-enrolment completed.",
  },
  "INC-4474": {
    id: "INC-4474",
    subject: "Dell Latitude screen flickering at random intervals",
    status: "open",
    priority: "low",
    customerId: "CUST-001",
    createdAt: "2025-06-26T09:45:00Z",
    notes: "Asset tag LAP-0023. Possible GPU driver issue or loose display cable. Warranty valid until 2026-03-10.",
  },
  "INC-4475": {
    id: "INC-4475",
    subject: "Core network switch unresponsive — partial outage",
    status: "in_progress",
    priority: "critical",
    customerId: "CUST-002",
    createdAt: "2025-06-27T03:20:00Z",
    notes: "Cisco Catalyst 2960 AST-SW-003 not responding to management VLAN. Onsite engineer dispatched. Backup switch being prepped.",
  },
  "INC-4476": {
    id: "INC-4476",
    subject: "Antivirus definitions outdated on 40+ endpoints",
    status: "resolved",
    priority: "high",
    customerId: "CUST-003",
    createdAt: "2025-06-20T11:00:00Z",
    notes: "CrowdStrike sensor update policy corrected. All 43 endpoints now reporting current definitions. Closed after 24-hr verification.",
  },
};

// ---- Assets ----

const ASSETS: Asset[] = [
  {
    assetId: "LAP-0023",
    name: "Dell Latitude 5540",
    type: "laptop",
    status: "active",
    assignedTo: "CUST-001",
    location: "Al Tayer Group — Dubai HQ, Floor 2",
  },
  {
    assetId: "LAP-0031",
    name: "Lenovo ThinkPad X1 Carbon Gen 11",
    type: "laptop",
    status: "active",
    assignedTo: "CUST-002",
    location: "Emaar — Downtown Dubai Office",
  },
  {
    assetId: "NET-0011",
    name: "Cisco Catalyst 2960-X",
    type: "network switch",
    status: "maintenance",
    assignedTo: "CUST-002",
    location: "Emaar — Downtown Dubai, Server Room B",
  },
  {
    assetId: "NET-0019",
    name: "Fortinet FortiGate 60F",
    type: "firewall / vpn router",
    status: "active",
    assignedTo: "CUST-001",
    location: "Al Tayer Group — Abu Dhabi Branch",
  },
  {
    assetId: "NET-0024",
    name: "Cisco RV340 Dual WAN VPN Router",
    type: "vpn router",
    status: "active",
    assignedTo: "CUST-003",
    location: "ADNOC — Ruwais Processing Plant",
  },
  {
    assetId: "PRN-0007",
    name: "HP LaserJet Pro M404dn",
    type: "printer",
    status: "active",
    assignedTo: "CUST-002",
    location: "Emaar — Downtown Dubai Office, Floor 3",
  },
  {
    assetId: "PRN-0012",
    name: "Canon imageRUNNER ADVANCE DX 4725i",
    type: "printer",
    status: "spare",
    assignedTo: "CUST-003",
    location: "ServesIT — Dubai Warehouse",
  },
  {
    assetId: "LAP-0044",
    name: "HP EliteBook 840 G10",
    type: "laptop",
    status: "decommissioned",
    assignedTo: "CUST-003",
    location: "ADNOC — Abu Dhabi HQ",
  },
];

// ---- Customers ----

const CUSTOMERS: Record<string, Customer> = {
  "CUST-001": {
    id: "CUST-001",
    name: "Mohammed Al Rashidi",
    company: "Al Tayer Group",
    email: "m.rashidi@altayer.ae",
    tier: "enterprise",
    activeTickets: 2,
  },
  "CUST-002": {
    id: "CUST-002",
    name: "Sarah Al Hashimi",
    company: "Emaar Properties",
    email: "s.hashimi@emaar.ae",
    tier: "premium",
    activeTickets: 2,
  },
  "CUST-003": {
    id: "CUST-003",
    name: "Ahmad Al Mansoori",
    company: "ADNOC",
    email: "a.mansoori@adnoc.ae",
    tier: "enterprise",
    activeTickets: 1,
  },
};

// ---- Query functions ----

export function lookupTicket(ticketId: string): Ticket | null {
  return TICKETS[ticketId.toUpperCase()] ?? null;
}

export function searchAssets(query: string): Asset[] {
  const q = query.toLowerCase();
  return ASSETS.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q) ||
      a.status.toLowerCase().includes(q) ||
      a.location.toLowerCase().includes(q)
  );
}

export function getCustomer(customerId: string): Customer | null {
  return CUSTOMERS[customerId.toUpperCase()] ?? null;
}
