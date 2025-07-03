
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InventoryItemWithForecast } from "@shared/schema";

export function useInventory() {
  return useQuery<InventoryItemWithForecast[]>({
    queryKey: ["/api/inventory"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/inventory");
      return response.json();
    },
  });
}
