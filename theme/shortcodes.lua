-- Interactive figures. In a post:
--
--   {{< plot "sin(a*x)" a=1..4 x=-6..6 >}}         graph with a slider for a (theme/site.html draws it)
--   {{< plot "x^2; a*x + b" a=-2..2 b=-1..1 y=-2..6 caption="Tangent lines" >}}
--   {{< desmos q1w2e3r4t5 >}}                       a saved Desmos graph, by its ID
--   {{< geogebra abcd1234 >}}                       a GeoGebra applet, by its material ID
--
-- In PDFs (and anything that isn't HTML) each one becomes a line pointing to the web version.

local function str(v)
  if v == nil then return "" end
  return pandoc.utils.stringify(v)
end

local function attr(s)
  return (s:gsub("&", "&amp;"):gsub('"', "&quot;"):gsub("<", "&lt;"))
end

local function web_only(what)
  return pandoc.Para({ pandoc.Emph({ pandoc.Str("[" .. what .. ": open the web version of this page to use it.]") }) })
end

local function caption(kwargs)
  local c = str(kwargs["caption"])
  return c ~= "" and ("<figcaption>" .. attr(c) .. "</figcaption>") or ""
end

local AXES = { x = true, y = true, caption = true }

return {
  plot = function(args, kwargs)
    if not quarto.doc.is_format("html") then return web_only("Interactive graph") end
    local params = {}
    for k, v in pairs(kwargs) do
      local s = str(v)
      if not AXES[k] and s ~= "" then table.insert(params, k .. "=" .. s) end
    end
    table.sort(params)
    return pandoc.RawBlock("html", string.format(
      '<figure class="am-plot" data-fn="%s" data-x="%s" data-y="%s" data-params="%s">%s</figure>',
      attr(str(args[1])), attr(str(kwargs["x"])), attr(str(kwargs["y"])), attr(table.concat(params, " ")), caption(kwargs)))
  end,

  desmos = function(args, kwargs)
    if not quarto.doc.is_format("html") then return web_only("Desmos graph") end
    local id = str(args[1]):gsub("[^%w]", "")
    return pandoc.RawBlock("html", string.format(
      '<figure class="am-embed"><iframe src="https://www.desmos.com/calculator/%s?embed" title="Desmos graph" loading="lazy"></iframe>%s</figure>',
      id, caption(kwargs)))
  end,

  geogebra = function(args, kwargs)
    if not quarto.doc.is_format("html") then return web_only("GeoGebra applet") end
    local id = str(args[1]):gsub("[^%w]", "")
    return pandoc.RawBlock("html", string.format(
      '<figure class="am-embed"><iframe src="https://www.geogebra.org/material/iframe/id/%s" title="GeoGebra applet" loading="lazy"></iframe>%s</figure>',
      id, caption(kwargs)))
  end,
}
