"use client";

// A real Next.js <Link> renders as an <a>, so it can't contain another <a>
// (nested anchors are invalid HTML and browsers mangle them). Cards that are
// themselves a Link use this button instead of a plain Zoom <a> tag.
export default function ZoomJoinButton({
  zoomLink,
  className = "btn zoom-btn",
  children = "Join Zoom",
}: {
  zoomLink: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(zoomLink, "_blank", "noopener");
      }}
    >
      {children}
    </button>
  );
}
