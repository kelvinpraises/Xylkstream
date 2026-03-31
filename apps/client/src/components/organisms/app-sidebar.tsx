import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Activity,
  History,
  Users,
  ChevronsUpDown,
  LogOut,
  Settings2,
  Sparkles,
  Moon,
  Sun,
  Copy,
  Network,
  Bot,
  Boxes,
  Wallet,
  Contact,
} from "lucide-react";
import * as React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useLogout } from "@/hooks/use-logout";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { usePendingProposalCount } from "@/hooks/use-proposals";
import { truncateAddress } from "@/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/avatar";
import { useTheme } from "@/providers/theme-provider";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/organisms/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/molecules/dropdown-menu";
import { cn } from "@/utils";
import { useChain } from "@/providers/chain-provider";
import { supportedChains } from "@/config/chains";
import { useCollectableScanner } from "@/hooks/use-collectable-scanner";

const navData = {
  platform: [
    {
      title: "Home",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Wallet",
      url: "/wallet",
      icon: Wallet,
    },
    {
      title: "Payments",
      url: "/streams",
      icon: Activity,
    },
    {
      title: "Activity",
      url: "/history",
      icon: History,
    },
    {
      title: "People",
      url: "/circles",
      icon: Users,
    },
    {
      title: "Contacts",
      url: "/contacts",
      icon: Contact,
    },
    {
      title: "Proposals",
      url: "/proposals",
      icon: Bot,
    },
    {
      title: "YieldBox",
      url: "/yieldbox",
      icon: Boxes,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  usePrivy(); // ensure auth context is available
  const location = useLocation();
  const { isMobile } = useSidebar();
  const { mutate: logout } = useLogout();
  const { setTheme, theme } = useTheme();
  const { chainId, switchChain } = useChain();
  const { data: pendingCount } = usePendingProposalCount();
  const { stealthAddress } = useStealthWallet();
  const { collectableTokens } = useCollectableScanner();


  const userData = {
    name: stealthAddress ? truncateAddress(stealthAddress) : "...",
    email: "Signed In",
    avatar: `https://avatar.vercel.sh/${stealthAddress || "user"}`,
  };

  const handleCopyAddress = () => {
    if (!stealthAddress) return;
    navigator.clipboard.writeText(stealthAddress);
    toast.success("Address copied to clipboard");
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 py-2">
          <div className="size-8 min-w-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
            <span className="font-serif text-base font-bold italic text-white tracking-tighter">X</span>
          </div>
          <span className="font-serif text-lg font-medium tracking-wide text-foreground group-data-[collapsible=icon]:hidden">
            Xylkstream
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarMenu>
            {navData.platform.map((item) => {
              const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + "/");
              return (
                <SidebarMenuItem key={item.title}>
                  <Link to={item.url}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive}
                      className={cn(
                        "rounded-md mb-1 transition-colors",
                        isActive &&
                          "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      )}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                      {item.title === "Proposals" && !!pendingCount && pendingCount > 0 && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-medium text-purple-400">
                          {pendingCount}
                        </span>
                      )}
                      {item.title === "Wallet" && collectableTokens.length > 0 && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.6)]" />
                      )}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={userData.avatar} alt={userData.name} />
                    <AvatarFallback className="rounded-lg">
                      {userData.name.substring(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{userData.name}</span>
                    <span className="truncate text-xs">{userData.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <Network className="size-4" />
                    {supportedChains[chainId]?.chain.name ?? "Unknown Network"}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {Object.values(supportedChains).map(({ chain }) => (
                      <DropdownMenuItem
                        key={chain.id}
                        onClick={() => switchChain(chain.id)}
                      >
                        {chain.name}
                        {chain.id === chainId && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCopyAddress} disabled={!stealthAddress}>
                  <Copy className="size-4" />
                  Copy Privacy Address
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <div className="relative size-4">
                      <Sun className="size-4 absolute rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                      <Moon className="size-4 absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </div>
                    Theme
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setTheme("lavender")}>
                      <Sparkles className="size-4 text-purple-400" />
                      Light
                      {theme === "lavender" && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("aurora")}>
                      <Moon className="size-4 text-indigo-400" />
                      Dark
                      {theme === "aurora" && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>
                      <svg
                        className="size-4 text-slate-400"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="20" height="14" x="2" y="3" rx="2" />
                        <line x1="8" x2="16" y1="21" y2="21" />
                        <line x1="12" x2="12" y1="17" y2="21" />
                      </svg>
                      System
                      {theme === "system" && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="size-4" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
