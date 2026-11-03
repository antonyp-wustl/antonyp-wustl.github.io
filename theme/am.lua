-- Per-page features that need the page's own front matter.
-- theme/site.html reads the hidden <div id="am-page"> this filter adds.

local months = { "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December" }

local function str(v)
  if v == nil then return nil end
  local s = pandoc.utils.stringify(v)
  return s ~= "" and s or nil
end

local function truthy(v)
  if v == nil then return false end
  if type(v) == "boolean" then return v end
  return str(v) == "true"
end

local function attr(s)
  return (s:gsub("&", "&amp;"):gsub('"', "&quot;"):gsub("<", "&lt;"))
end

local function long_date(iso)
  local y, m, d = (iso or ""):match("^(%d%d%d%d)-(%d%d)-(%d%d)")
  if not y then return iso end
  return tonumber(d) .. " " .. months[tonumber(m)] .. " " .. y
end

-- Which kind of page is this? posts/<slug>/index.qmd or notes/<file>.qmd
local function page_kind()
  local f = (quarto.doc.input_file or ""):gsub("\\", "/")
  if f:match("/posts/[^/_][^/]*/index%.qmd$") then return "post" end
  if f:match("/notes/[^/_][^/]*%.qmd$") then return "note" end
  return nil
end

function Pandoc(doc)
  if not quarto.doc.is_format("html") then return doc end
  local meta, kind = doc.meta, page_kind()
  if not kind then return doc end

  -- Notes don't need a title.
  if kind == "note" and not str(meta.title) then
    meta.title = pandoc.Inlines("Note, " .. long_date(str(meta.date)))
    meta.pagetitle = meta.title
  end

  -- Source path relative to the project, for the "Edit this page" link.
  local f = (quarto.doc.input_file or ""):gsub("\\", "/")
  local src = f:match("/(posts/[^/]+/index%.qmd)$") or f:match("/(notes/[^/]+%.qmd)$")
  local data = { 'data-kind="' .. kind .. '"' }
  if src then table.insert(data, 'data-src="' .. attr(src) .. '"') end
  if str(meta.series) then table.insert(data, 'data-series="' .. attr(str(meta.series)) .. '"') end
  if truthy(meta["fold-proofs"]) then table.insert(data, 'data-fold-proofs="true"') end
  doc.blocks:insert(1, pandoc.RawBlock("html",
    '<div id="am-page" hidden ' .. table.concat(data, " ") .. '></div>'))
  return doc
end
