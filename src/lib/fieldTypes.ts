export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "time_start"
  | "time_end"
  | "address"
  | "dropdown"
  | "checkbox"
  | "radio"
  | "signature"
  | "heading"
  | "paragraph"
  | "divider"
  | "page_break"
  | "section_collapse"
  | "payment";

export const FIELD_LIBRARY: { type: FieldType; label: string; icon: string; needsOptions?: boolean; color: string }[] = [
  { type: "text", label: "Short text", icon: "✎", color: "ocean" },
  { type: "textarea", label: "Long text", icon: "≣", color: "leaf" },
  { type: "email", label: "Email", icon: "✉", color: "coral" },
  { type: "phone", label: "Phone", icon: "☎", color: "plumeria" },
  { type: "number", label: "Number", icon: "#", color: "ocean" },
  { type: "date", label: "Date", icon: "📅", color: "leaf" },
  { type: "time_start", label: "Time Start", icon: "🕐", color: "plumeria" },
  { type: "time_end", label: "Time End", icon: "🕑", color: "plumeria" },
  { type: "address", label: "Address", icon: "📍", color: "coral" },
  { type: "dropdown", label: "Dropdown", icon: "▾", needsOptions: true, color: "plumeria" },
  { type: "radio", label: "Choice (pick one)", icon: "◉", needsOptions: true, color: "ocean" },
  { type: "checkbox", label: "Checkboxes", icon: "☑", needsOptions: true, color: "leaf" },
  { type: "signature", label: "Signature", icon: "✒", color: "coral" },
  { type: "heading", label: "Section heading", icon: "H", color: "plumeria" },
  { type: "paragraph", label: "Paragraph / Legal Text", icon: "📄", color: "ocean" },
  { type: "divider", label: "Divider", icon: "—", color: "ocean" },
  { type: "page_break", label: "Page Break", icon: "⏭", color: "plumeria" },
  { type: "section_collapse", label: "Collapsible Section", icon: "▾", color: "plumeria" },
  { type: "payment", label: "Payment", icon: "💳", color: "coral" }
];

// Tailwind needs literal class names to detect them at build time, so we map
// each palette color to its full class strings here rather than building
// them dynamically with template strings.
export const FIELD_COLOR_CLASSES: Record<string, { bg: string; text: string; softBg: string; border: string }> = {
  ocean: { bg: "bg-ocean", text: "text-ocean", softBg: "bg-ocean/10", border: "border-ocean/30" },
  leaf: { bg: "bg-leaf", text: "text-leaf", softBg: "bg-leaf/10", border: "border-leaf/30" },
  coral: { bg: "bg-coral", text: "text-coral", softBg: "bg-coral/10", border: "border-coral/30" },
  plumeria: { bg: "bg-plumeria", text: "text-plumeria", softBg: "bg-plumeria/10", border: "border-plumeria/30" }
};

export function defaultLabelFor(type: FieldType) {
  const preset: Record<string, string> = {
    text: "Full name",
    textarea: "Message",
    email: "Email",
    phone: "Phone number",
    number: "Number",
    date: "Date",
    time_start: "Start time",
    time_end: "End time",
    address: "Mailing address",
    dropdown: "Choose one",
    radio: "Choose one",
    checkbox: "Select all that apply",
    signature: "Signature",
    heading: "Section title",
    paragraph: "Paste your contract terms, instructions, or any note here.",
    divider: "",
    page_break: "Continue to the next step",
    section_collapse: "Section title",
    payment: "Deposit"
  };
  return preset[type] ?? "New field";
}

export type BuilderField = {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string | null;
  required: boolean;
  options?: string[] | null;
  imageUrl?: string | null;
  imageZoom?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  opacity?: number;
  strokeWidth?: number;
  strokeColor?: string | null;
  color?: string | null; // custom pill fill color override
  fontSize?: number | null;
  fontFamily?: string | null;
  textCase?: string | null;
  labelAlign?: string | null;
  collapsedByDefault?: boolean;
  paymentAmountType?: string | null;
  paymentFixedAmount?: number | null;
  paymentDescription?: string | null;
  bgColor?: string | null;
  bgColorOpacity?: number;
  bgImageUrl?: string | null;
  bgImageZoom?: number;
  bgImageOffsetX?: number;
  bgImageOffsetY?: number;
  bgImageOpacity?: number;
};
