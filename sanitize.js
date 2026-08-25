const ALLOWED = new Set(["P", "DIV", "BR", "B", "STRONG", "I", "EM", "SPAN"]);
const DROPPED = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "TEMPLATE", "NOSCRIPT"]);

export function sanitizeHtml(html) {
  const source = String(html || "");
  if (!source.trim()) return "";
  if (typeof document === "undefined") return source.replace(/<[^>]*>/g, "");

  const template = document.createElement("template");
  template.innerHTML = source;

  [...template.content.querySelectorAll("*")].forEach((element) => {
    if (!element.isConnected && !template.content.contains(element)) return;
    if (DROPPED.has(element.tagName)) {
      element.remove();
      return;
    }
    if (!ALLOWED.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const style = element.getAttribute("style") || "";
    [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
    const safeStyle = style.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const [property, value] = part.split(":").map((item) => item.trim());
      if (property === "font-weight" && /^(bold|[5-9]00)$/i.test(value)) return "font-weight:bold";
      if (property === "font-style" && value === "italic") return "font-style:italic";
      return "";
    }).filter(Boolean).join(";");
    if (safeStyle) element.setAttribute("style", safeStyle);
  });

  return template.innerHTML;
}
