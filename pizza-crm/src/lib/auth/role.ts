export type Role = "owner" | "cashier" | "kitchen" | "monitor" | "ventas";

export const roleLabelsEs: Record<Role, string> = {
  owner: "Propietario",
  cashier: "Cajero",
  kitchen: "Cocina",
  monitor: "Monitoreo",
  ventas: "Ventas",
};

export function roleToPath(role: Role): string {
  switch (role) {
    case "owner":
      return "/owner";
    case "cashier":
      return "/cashier";
    case "kitchen":
      return "/kitchen";
    case "monitor":
      return "/monitor";
    case "ventas":
      return "/crm";
  }
}
