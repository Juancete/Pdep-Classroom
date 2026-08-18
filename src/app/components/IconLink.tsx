import Link from "next/link";
import type { ComponentType } from "react";

export function IconLink({
  href,
  label,
  Icon,
  className = "",
}: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors ${className}`}
    >
      <Icon className="w-4 h-4" />
    </Link>
  );
}
