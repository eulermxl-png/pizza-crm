export type Role = "owner" | "cashier" | "kitchen" | "monitor";

export const roleLabelsEs: Record<Role, string> = {
  owner: "Propietario",
  cashier: "Cajero",
  kitchen: "Cocina",
  monitor: "Monitoreo",
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
  }
}
