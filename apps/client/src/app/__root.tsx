import { createRootRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import RootProvider, { LightProvider } from "@/providers";
import { Toaster } from "@/components/molecules/sonner";
import { PasswordDialog } from "@/components/organisms/password-dialog";
import { AppSidebar } from "@/components/organisms/app-sidebar";
import { SidebarInset, SidebarTrigger } from "@/components/organisms/sidebar";
import { Separator } from "@/components/atoms/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/molecules/breadcrumb";
import "@/styles/globals.css";

export const Route = createRootRoute({
  component: RootLayout,
});

const formatPathSegment = (segment: string): string => {
  const routeNameMap: Record<string, string> = {
    dashboard: "Home",
    streams: "Payments",
    history: "Activity",
    contacts: "Contacts",
    circles: "People",
    yieldbox: "YieldBox",
    proposals: "Proposals",
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
  const isFullscreenRoute = location.pathname.startsWith("/circles/join") || location.pathname.startsWith("/oauth/");

  const segments = location.pathname?.slice(1).split("/").filter(Boolean) || [];

  if (location.pathname.startsWith("/oauth/")) {
    return (
      <LightProvider>
        <Outlet />
        <Toaster />
      </LightProvider>
    );
  }

  if (isHomePage || isFullscreenRoute) {
    return (
      <RootProvider>
        <Outlet />
        <PasswordDialog />
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
      <PasswordDialog />
      <Toaster />
      {/* <TanStackRouterDevtools /> */}
    </RootProvider>
  );
}
