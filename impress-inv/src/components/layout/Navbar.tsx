"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { NAV_ITEMS, type NavItem } from "./nav-items";
import { ProfileDropdown } from "./ProfileDropdown";
import { usePermissions } from "@/hooks/usePermissions";

const MENU_WIDTH = 224;

// The items of an open menu. An item that has its own items (for example Store Department > Reports) opens its
// own menu at the SIDE (right, or left when there is no room on the right). It opens in two ways:
//   - hover: it opens when the mouse is on it, and closes a moment after the mouse has left;
//   - click: it opens and stays open (pinned) until it is clicked again, another item is used, or the menu closes.
// The gap between the two menus is part of the side menu (padding), and the close has a short delay, so the mouse
// can cross over without the menu closing on the way.
function DropdownItems({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [side, setSide] = useState<"right" | "left">("right");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const openItem = (label: string, element: HTMLElement) => {
    cancelClose();
    const rect = element.getBoundingClientRect();
    setSide(rect.right + MENU_WIDTH + 8 <= window.innerWidth ? "right" : "left");
    setOpen(label);
  };

  const scheduleClose = (label: string) => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setOpen((current) => (current === label && pinned !== label ? null : current));
    }, 250);
  };

  return (
    <div className="w-[min(14rem,calc(100vw-2rem))] rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
      {items.map((item) => {
        if (!item.children?.length) {
          return (
            <Link
              key={item.label}
              href={item.href ?? "#"}
              className="block rounded px-1 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-primary-50 hover:text-primary-600"
            >
              {item.label}
            </Link>
          );
        }

        const isOpen = open === item.label;
        const isPinned = pinned === item.label;
        const toward = side === "right" ? "translate-x-0.5" : "-translate-x-0.5";

        return (
          <div
            key={item.label}
            className="relative"
            onMouseEnter={(event) => {
              // hovering another group lets go of a group that was pinned by a click
              if (pinned && pinned !== item.label) setPinned(null);
              openItem(item.label, event.currentTarget);
            }}
            onMouseLeave={() => scheduleClose(item.label)}
          >
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={(event) => {
                const wrapper = event.currentTarget.parentElement as HTMLElement;
                if (isOpen && isPinned) {
                  setPinned(null);
                  setOpen(null);
                } else {
                  openItem(item.label, wrapper);
                  setPinned(item.label);
                }
              }}
              className={`flex w-full items-center justify-between gap-6 rounded px-1 py-2 text-xs transition-colors hover:bg-primary-50 hover:text-primary-600 ${
                isOpen ? "bg-primary-50 font-medium text-primary-600" : "text-zinc-700"
              }`}
            >
              {item.label}
              {/* The arrow points to the side the menu opens to; it moves a little toward it while it is open */}
              <Icon
                icon={side === "right" ? "mdi:chevron-right" : "mdi:chevron-left"}
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ease-out ${isOpen ? toward : "translate-x-0"}`}
              />
            </button>

            {/* The side menu stays in place and fades / slides in and out */}
            <div
              aria-hidden={!isOpen}
              className={`absolute top-0 z-10 transition-all duration-150 ease-out ${
                side === "right" ? "left-full pl-1" : "right-full pr-1"
              } ${
                isOpen
                  ? "visible translate-x-0 opacity-100"
                  : `pointer-events-none invisible opacity-0 ${side === "right" ? "-translate-x-1" : "translate-x-1"}`
              }`}
            >
              <DropdownItems items={item.children} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Navbar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  // a menu opened by a click stays open until a click outside, a click on it again, or a page opens
  const [pinnedMenu, setPinnedMenu] = useState<string | null>(null);
  const [menuSide, setMenuSide] = useState<"left" | "right">("left");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { hasPermission, isSuperAdmin } = usePermissions();
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpenMenu(null);
    setPinnedMenu(null);
    setIsProfileOpen(false);
  }, [pathname]);

  // A click anywhere outside the navbar closes the menu that a click kept open
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
        setPinnedMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filterNavItems = (items: NavItem[]): NavItem[] => {
    return items
      .map(item => {
        if (item.children) {
          const filteredChildren = filterNavItems(item.children);
          return { ...item, children: filteredChildren };
        }
        return item;
      })
      .filter(item => {
        // If it has children, only keep it if it has at least one visible child
        if (item.children) {
          return item.children.length > 0;
        }
        if (item.superAdminOnly) return isSuperAdmin;
        // If it's a leaf node with an operation, check permission
        if (item.operation) {
          return hasPermission(item.operation, "view");
        }
        // Keep if no operation is defined (fallback)
        return true;
      });
  };

  const filteredNavItems = filterNavItems(NAV_ITEMS);

  const handleMenuOpen = (
    label: string,
    element: HTMLElement
  ) => {
    setIsProfileOpen(false);
    const rect = element.getBoundingClientRect();

    const hasRightSpace =
      rect.left + MENU_WIDTH + 8 <= window.innerWidth;

    setMenuSide(hasRightSpace ? "left" : "right");
    setOpenMenu(label);
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-40 max-w-full border-b border-zinc-200 bg-white">
      <nav className="flex max-w-full flex-wrap items-center justify-between px-4 py-2">
        {/* Left side Nav Items */}
        <div className="flex flex-wrap items-center gap-1 overflow-x-clip">
          {filteredNavItems.map((item) =>
            item.children?.length ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={(e) => {
                  // hovering another menu lets go of a menu that was kept open by a click
                  if (pinnedMenu && pinnedMenu !== item.label) setPinnedMenu(null);
                  handleMenuOpen(item.label, e.currentTarget);
                }}
                onMouseLeave={() => {
                  if (pinnedMenu !== item.label) setOpenMenu(null);
                }}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === item.label}
                  onClick={(e) => {
                    if (openMenu === item.label && pinnedMenu === item.label) {
                      setPinnedMenu(null);
                      setOpenMenu(null);
                    } else {
                      handleMenuOpen(item.label, e.currentTarget.parentElement as HTMLElement);
                      setPinnedMenu(item.label);
                    }
                  }}
                  className={`flex items-center gap-1 whitespace-nowrap rounded px-1 py-2 text-xs font-medium transition-colors hover:bg-primary-50 hover:text-primary-600 ${
                    openMenu === item.label ? "bg-primary-50 text-primary-600" : "text-zinc-700"
                  }`}
                >
                  {item.label}

                  <Icon
                    icon="mdi:chevron-down"
                    className={`h-4 w-4 transition-transform duration-200 ease-out ${
                      openMenu === item.label ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </button>

                {openMenu === item.label && (
                  <div
                    className={`absolute top-full pt-1 ${menuSide === "left"
                      ? "left-0"
                      : "right-0"
                      }`}
                  >
                    <DropdownItems items={item.children} />
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href ?? "#"}
                className="whitespace-nowrap rounded px-1 py-2 text-xs font-medium text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
              >
                {item.label}
              </Link>
            )
          )}
        </div>



        {/* Right side Actions + Profile Dropdown */}
        <div className="flex items-center gap-2">
          {/* <Link
            href="/data-sync"
            className="flex items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition shadow-sm"
            title="Data Synchronization Hub"
          >
            <Icon icon="mdi:cloud-sync" className="h-4 w-4 text-primary-600" />
            <span className="hidden sm:inline">Data Sync</span>
          </Link> */}
          <ProfileDropdown isOpen={isProfileOpen} setIsOpen={setIsProfileOpen} />
        </div>
      </nav>
    </header>
  );
}
