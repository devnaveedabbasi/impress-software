"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { NAV_ITEMS, type NavItem } from "./nav-items";
import { ProfileDropdown } from "./ProfileDropdown";
import { usePermissions } from "@/hooks/usePermissions";

const MENU_WIDTH = 224;

function DropdownItems({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [side, setSide] = useState<"right" | "left">("right");
  const pathname = usePathname();

  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  const handleOpen = (
    label: string,
    element: HTMLDivElement
  ) => {
    const rect = element.getBoundingClientRect();

    const hasRightSpace =
      rect.right + MENU_WIDTH + 8 <= window.innerWidth;

    setSide(hasRightSpace ? "right" : "left");
    setOpen(label);
  };

  return (
    <div className="w-[min(14rem,calc(100vw-2rem))] rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
      {items.map((item) =>
        item.children?.length ? (
          <div
            key={item.label}
            className="relative"
            onMouseEnter={(e) =>
              handleOpen(item.label, e.currentTarget)
            }
            onMouseLeave={() => setOpen(null)}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-6 rounded px-1 py-2 text-xs text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
            >
              {item.label}

              <Icon
                icon="mdi:chevron-right"
                className="h-4 w-4 shrink-0"
              />
            </button>

            {open === item.label && (
              <div
                className={`absolute top-0 ${side === "right"
                  ? "left-full ml-1"
                  : "right-full mr-1"
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
            className="block rounded px-1 py-1.5 text-xs text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
          >
            {item.label}
          </Link>
        )
      )}
    </div>
  );
}

export function Navbar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuSide, setMenuSide] = useState<"left" | "right">("left");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const pathname = usePathname();

  useEffect(() => {
    setOpenMenu(null);
    setIsProfileOpen(false);
  }, [pathname]);

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
    element: HTMLDivElement
  ) => {
    setIsProfileOpen(false);
    const rect = element.getBoundingClientRect();

    const hasRightSpace =
      rect.left + MENU_WIDTH + 8 <= window.innerWidth;

    setMenuSide(hasRightSpace ? "left" : "right");
    setOpenMenu(label);
  };

  return (
    <header className="sticky top-0 z-40 max-w-full border-b border-zinc-200 bg-white">
      <nav className="flex max-w-full flex-wrap items-center justify-between px-4 py-2">
        {/* Left side Nav Items */}
        <div className="flex flex-wrap items-center gap-1 overflow-x-clip">
          {filteredNavItems.map((item) =>
            item.children?.length ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={(e) =>
                  handleMenuOpen(item.label, e.currentTarget)
                }
                onMouseLeave={() => setOpenMenu(null)}
              >
                <button
                  type="button"
                  className="flex items-center gap-1 whitespace-nowrap rounded px-1 py-2 text-xs font-medium text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
                >
                  {item.label}

                  <Icon
                    icon="mdi:chevron-down"
                    className="h-4 w-4"
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

        {/* Right side Profile Dropdown */}
        <ProfileDropdown isOpen={isProfileOpen} setIsOpen={setIsProfileOpen} />
      </nav>
    </header>
  );
}