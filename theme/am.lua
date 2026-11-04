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

-- Which kind of page is this? posts/<slug>/index.qmd, lectures/<slug>/index.qmd,
-- notes/<file>.qmd or problems/<file>.qmd
local function page_kind()
  local f = (quarto.doc.input_file or ""):gsub("\\", "/")
  if f:match("/posts/[^/_][^/]*/index%.qmd$") then return "post" end
  if f:match("/lectures/[^/_][^/]*/index%.qmd$") then return "lecture" end
  if f:match("/results/[^/_][^/]*/index%.qmd$") then return "result" end
  if f:match("/notes/[^/_][^/]*%.qmd$") then return "note" end
  if f:match("/problems/[^/_][^/]*%.qmd$") then return "problem" end
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
  local src = f:match("/(posts/[^/]+/index%.qmd)$") or f:match("/(lectures/[^/]+/index%.qmd)$")
    or f:match("/(results/[^/]+/index%.qmd)$")
    or f:match("/(notes/[^/]+%.qmd)$") or f:match("/(problems/[^/]+%.qmd)$")
  local data = { 'data-kind="' .. kind .. '"' }
  if src then table.insert(data, 'data-src="' .. attr(src) .. '"') end
  if str(meta.series) then table.insert(data, 'data-series="' .. attr(str(meta.series)) .. '"') end
  if str(meta.course) then table.insert(data, 'data-course="' .. attr(str(meta.course)) .. '"') end
  if str(meta.lecture) then table.insert(data, 'data-lecture="' .. attr(str(meta.lecture)) .. '"') end
  if str(meta.source) then table.insert(data, 'data-source="' .. attr(str(meta.source)) .. '"') end
  if str(meta.difficulty) then table.insert(data, 'data-difficulty="' .. attr(str(meta.difficulty)) .. '"') end
  if truthy(meta["fold-proofs"]) then table.insert(data, 'data-fold-proofs="true"') end
  doc.blocks:insert(1, pandoc.RawBlock("html",
    '<div id="am-page" hidden ' .. table.concat(data, " ") .. '></div>'))

  -- Research results: status, venue and links (paper, arXiv, DOI, code) in a box under the title.
  if kind == "result" then
    local parts = {}
    local status = str(meta.status)
    if status then
      table.insert(parts, '<span class="am-res-status am-res-' .. attr(status:lower():gsub("%s+", "-")) .. '">' .. attr(status) .. '</span>')
    end
    if str(meta.venue) then table.insert(parts, '<span class="am-res-venue">' .. attr(str(meta.venue)) .. '</span>') end
    local links = {}
    if str(meta.pdf) then table.insert(links, '<a href="' .. attr(str(meta.pdf)) .. '">Paper (PDF)</a>') end
    if str(meta.arxiv) then table.insert(links, '<a href="https://arxiv.org/abs/' .. attr(str(meta.arxiv)) .. '">arXiv:' .. attr(str(meta.arxiv)) .. '</a>') end
    if str(meta.doi) then table.insert(links, '<a href="https://doi.org/' .. attr(str(meta.doi)) .. '">DOI</a>') end
    if str(meta.code) then table.insert(links, '<a href="' .. attr(str(meta.code)) .. '">Code</a>') end
    if #links > 0 then table.insert(parts, '<span class="am-res-links">' .. table.concat(links) .. '</span>') end
    if #parts > 0 then
      doc.blocks:insert(2, pandoc.RawBlock("html", '<div class="am-res-box">' .. table.concat(parts) .. '</div>'))
    end
  end
  return doc
end
