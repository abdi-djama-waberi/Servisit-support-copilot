import type Anthropic from "@anthropic-ai/sdk";
import { lookupTicket, searchAssets, getCustomer } from "@/lib/mock/servesit-backend";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "lookup_ticket",
    description:
      "Fetch a ServesIT support ticket by its ID. Use this when the customer references a ticket number or asks for the status of an existing issue.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticketId: {
          type: "string",
          description: "The ticket ID in the format INC-NNNN, e.g. INC-4471",
        },
      },
      required: ["ticketId"],
    },
  },
  {
    name: "search_assets",
    description:
      "Search ServesIT managed IT assets by keyword. Useful when the customer asks about a specific device type (laptop, router, VPN, printer, switch) or its status and location.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Keyword to search for, e.g. 'laptop', 'printer', 'VPN router', 'switch', 'maintenance'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_customer",
    description:
      "Fetch a customer profile by their customer ID. Use this to look up the customer's company, support tier, and number of active tickets.",
    input_schema: {
      type: "object" as const,
      properties: {
        customerId: {
          type: "string",
          description: "The customer ID in the format CUST-NNN, e.g. CUST-001",
        },
      },
      required: ["customerId"],
    },
  },
];

type ToolInput = Record<string, string>;

export function executeTool(name: string, input: ToolInput): unknown {
  switch (name) {
    case "lookup_ticket": {
      const result = lookupTicket(input.ticketId ?? "");
      if (!result) {
        return { error: `Ticket ${input.ticketId} not found` };
      }
      return result;
    }
    case "search_assets": {
      const results = searchAssets(input.query ?? "");
      if (results.length === 0) {
        return { results: [], message: `No assets found matching "${input.query}"` };
      }
      return { results };
    }
    case "get_customer": {
      const result = getCustomer(input.customerId ?? "");
      if (!result) {
        return { error: `Customer ${input.customerId} not found` };
      }
      return result;
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
