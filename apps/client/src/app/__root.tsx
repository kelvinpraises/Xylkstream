import { createRootRoute, Link, Outlet, useLocation, useMatches } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import RootProvider from "@/providers";
import { Toaster } from "@/components/sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarTrigger } from "@/components/sidebar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ChevronRight } from "lucide-react";
import { Separator } from "@/components/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/breadcrumb";
import "@/styles/globals.css";

export const Route = createRootRoute({
  component: RootLayout,
});

const formatPathSegment = (segment: string): string => {
  const routeNameMap: Record<string, string> = {
    dashboard: "Dashboard",
    streams: "Streams",
    history: "History",
    contacts: "Contacts",
    settings: "Settings",
  };

  if (routeNameMap[segment.toLowerCase()]) {
    return routeNameMap[segment.toLowerCase()];
  }

  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

function RootLayout() {
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  const segments = location.pathname?.slice(1).split("/").filter(Boolean) || [];

  if (isHomePage) {
    return (
      <RootProvider>
        <Outlet />
        <Toaster />
      </RootProvider>
    );
  }

  return (
    <RootProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {segments.map((segment, index) => {
                  const isLast = index === segments.length - 1;
                  const href = "/" + segments.slice(0, index + 1).join("/");
                  const formattedSegment = formatPathSegment(segment);

                  return (
                    <div key={href} className="flex items-center gap-1.5">
                      {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
                      {isLast ? (
                        <BreadcrumbItem>
                          <BreadcrumbPage>{formattedSegment}</BreadcrumbPage>
                        </BreadcrumbItem>
                      ) : (
                        <BreadcrumbItem className="hidden md:block">
                          <BreadcrumbLink asChild>
                            <Link to={href}>{formattedSegment}</Link>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                      )}
                    </div>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </SidebarInset>
      <Toaster />
      {/* <TanStackRouterDevtools /> */}
    </RootProvider>
  );
}
