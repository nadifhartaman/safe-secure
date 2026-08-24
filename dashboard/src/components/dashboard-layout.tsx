"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Settings,
  Bell,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Search,
  LucideIcon,
  Shield,
  Eye,
  Car,
  Building2,
  Flame,
  Factory,
  Wheat,
  FileText,
  Activity,
  Layers,
  Cpu,
  Cloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Map string nama ikon ke Komponen Lucide
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Settings,
  Shield,
  Eye,
  Car,
  Building2,
  Flame,
  Factory,
  Wheat,
  FileText,
  Activity,
  Layers,
  Cpu,
  Cloud,
};

// Interface Rekursif (Mendukung Submenu tanpa Batas Kedalaman)
export interface MenuItem {
  name: string;
  url?: string;
  icon?: string;
  submenus?: MenuItem[];
}

export const menuData: MenuItem[] = [
  {
    name: "Safe and Secure",
    icon: "Shield",
    url: "/safe-secure"
  },
  // {
  //   name: "Mobility",
  //   icon: "Car",
  //   submenus: [
  //     { name: "Plat", url: "" },
  //     { name: "Crowd", url: "" },
  //     { name: "Absensi Wajah", url: "https://absensi.indismart.co.id/" },
  //   ]
  // },
  // {
  //   name: "Oil & Gas & Mining",
  //   icon: "Flame",
  //   url: "/oil-gas",
  //   submenus: [
  //     { name: "APD", url: "" },
  //     { name: "Safe Zone Detection", url: "" },
  //   ]
  // },
  // {
  //   name: "Building & Facility Management",
  //   icon: "Building2",
  //   url: "/building",
  //   submenus: [
  //     { name: "Building Monitoring", url: "http://localhost:5000/" },
  //     { name: "Structural Health Monitoring", url: "https://mirra.indismart.co.id/" },
  //   ]
  // },
];

export default function DashboardLayout({
  children,
  menu = menuData,
}: {
  children: React.ReactNode;
  menu?: MenuItem[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});

  const toggleSubmenu = (key: string) => {
    setOpenSubmenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderMenuItems = (items: MenuItem[], parentKey = "", isMobile = false) => {
    return (
      <ul className={`${parentKey ? "ml-3 border-l pl-2 mt-1 space-y-1" : "space-y-1 p-2"} text-[13px] font-medium`}>
        {items.map((item, index) => {
          const itemKey = `${parentKey}-${index}`;
          const IconComponent = item.icon ? iconMap[item.icon] : null;
          const hasSubmenus = item.submenus && item.submenus.length > 0;
          const isOpen = openSubmenus[itemKey];

          return (
            <li key={itemKey}>
              {hasSubmenus ? (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSubmenu(itemKey)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground ${isCollapsed && !isMobile && !parentKey ? "justify-center px-0" : ""
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      {IconComponent && <IconComponent className="h-4 w-4 shrink-0" />}
                      {(!isCollapsed || isMobile || parentKey) && <span className="text-left">{item.name}</span>}
                    </div>
                    {(!isCollapsed || isMobile || parentKey) && (
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      />
                    )}
                  </button>
                  {isOpen && (!isCollapsed || isMobile || parentKey) && renderMenuItems(item.submenus || [], itemKey, isMobile)}
                </div>
              ) : (
                <a
                  href={item.url || "#"}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5  transition-colors hover:bg-accent hover:text-foreground ${isCollapsed && !isMobile && !parentKey ? "justify-center px-0" : ""
                    }`}
                >
                  {IconComponent && <IconComponent className="h-3.5 w-3.5 shrink-0" />}
                  {(!isCollapsed || isMobile || parentKey) && <span>{item.name}</span>}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* ================= SIDEBAR DESKTOP ================= */}
      <aside
        className={`hidden border-r bg-background transition-all duration-300 md:flex md:flex-col ${isCollapsed ? "w-16" : "w-64"
          }`}
      >
        {/* Header Sidebar */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!isCollapsed && <span className="text-base font-bold text-primary">Indismart</span>}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="ml-auto h-8 w-8"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Menu Navigasi Dynamic */}
        <div className="flex-1 overflow-y-auto">{renderMenuItems(menu)}</div>

        {/* Footer Sidebar */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            className={`w-full gap-2.5 text-[13px] text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 ${isCollapsed ? "justify-center px-0" : "justify-start"
              }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Keluar</span>}
          </Button>
        </div>
      </aside>

      {/* ================= KONTEN UTAMA ================= */}
      <div className="flex flex-1 flex-col">
        {/* Top Header */}
        <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex h-16 items-center border-b px-4 font-bold text-primary">AdminPanel</div>
              {renderMenuItems(menu, "", true)}
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>AD</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuLabel>Akun Saya</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profil</DropdownMenuItem>
                <DropdownMenuItem>Pengaturan</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-500">Keluar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6">{children}</main>
      </div>
    </div>
  );
}