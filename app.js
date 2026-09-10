(function () {
  "use strict";

  let currentItems = [];
  let activeSortField = null;
  let activeSortDirection = null;

  const FIELD_PATTERNS = {
    name: ["name", "nome", "miner name", "item name"],
    size: ["size", "tamanho"],
    power: ["power", "poder", "potência", "potencia"],
    bonus: ["bonus", "bônus", "bonificação", "bonificacao"],
    quantity: ["quantity", "quantidade", "qty", "qtd"],
    sellable: ["can be sold", "can't be sold", "can´t be sold"]
  };

  function normalize(value) {
    return value.trim().replace(/^[:\-–—|\s]+/, "").trim();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findField(block, aliases) {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      for (const alias of aliases) {
        const pattern = new RegExp("^" + escapeRegExp(alias) + "\\s*(?::|=|-|–|—|\\|)?\\s*(.*)$", "i");
        const match = lines[i].match(pattern);
        if (match) {
          const sameLineValue = normalize(match[1] || "");
          if (sameLineValue) return sameLineValue;
          if (lines[i + 1]) return normalize(lines[i + 1]);
        }
      }
    }
    return "";
  }

  function normalizeSellable(value) {
    if (!value) return "Não informado";
    const normalized = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/^(yes|sim|true|1|allowed|vendavel)\b/.test(normalized)) return "Sim";
    if (/^(no|nao|false|0|not allowed|untradeable|unsellable)\b/.test(normalized)) return "Não";
    return value;
  }

  function extractGifSource(value) {
    const htmlSource = value.match(/<img[^>]+src=["']([^"']+\.gif(?:\?[^"']*)?)["']/i);
    if (htmlSource) return htmlSource[1];
    const markdownSource = value.match(/!\[[^\]]*\]\(([^)]+\.gif(?:\?[^)]*)?)\)/i);
    if (markdownSource) return markdownSource[1];
    const dataSource = value.match(/data:image\/gif;base64,[a-z0-9+/=]+/i);
    if (dataSource) return dataSource[0];
    const urlSource = value.match(/https?:\/\/[^\s<>"')]+\.gif(?:\?[^\s<>"')]+)?/i);
    if (urlSource) return urlSource[0];
    const fileSource = value.match(/(?:^|\s)([^\s<>"')]+\.gif(?:\?[^\s<>"')]+)?)(?=\s|$)/i);
    return fileSource ? fileSource[1] : "";
  }

  function findNameAndGif(block) {
    const match = block.match(/miner\s+detai(?:ls|s)\s+open(?:\s+[1-5])?\s*(?::|=|-|–|—|\|)?\s*([\s\S]*)/i);
    if (!match) return { name: "", gif: "" };

    const lines = match[1].split(/\r?\n/).map(normalize).filter(Boolean);
    let gif = "";
    let name = "";
    for (const line of lines) {
      const foundGif = extractGifSource(line);
      if (foundGif && !gif) gif = foundGif;
      const withoutGif = normalize(line
        .replace(/<img[^>]*>/ig, "")
        .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
        .replace(foundGif || /$^/, ""));
      if (withoutGif) {
        name = withoutGif;
        break;
      }
    }
    return { name, gif };
  }

  function findSellable(block) {
    // A forma negativa precisa ser verificada antes da positiva.
    if (/\b(?:can\s*['’´`]\s*t|cannot)\s+be\s+sold\b/i.test(block)) return "Não";
    if (/\bcan\s+be\s+sold\b/i.test(block)) return "Sim";
    return "Não informado";
  }

  function parseMinerDetails(raw) {
    const marker = /miner\s+detai(?:ls|s)/ig;
    if (!marker.test(raw)) return [];
    marker.lastIndex = 0;
    const blocks = raw.split(marker).slice(1).filter(block => block.trim());

    return blocks.map((block, index) => {
      const fields = {};
      for (const [key, aliases] of Object.entries(FIELD_PATTERNS)) fields[key] = findField(block, aliases);

      const identity = findNameAndGif("Miner details" + block);
      fields.name = identity.name || fields.name;

      if (!fields.name) {
        const knownLabels = Object.values(FIELD_PATTERNS).flat();
        fields.name = block.split(/\r?\n/).map(normalize).find(line => {
          if (!line) return false;
          return !knownLabels.some(label => new RegExp("^" + escapeRegExp(label) + "\\b", "i").test(line));
        }) || `Item ${index + 1}`;
      }

      return {
        name: fields.name,
        gif: identity.gif || extractGifSource(block),
        size: fields.size || "—",
        power: fields.power || "—",
        bonus: fields.bonus || "—",
        quantity: fields.quantity || "—",
        sellable: findSellable(block)
      };
    });
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    return cell;
  }

  function createNameCell(item) {
    const cell = document.createElement("td");
    const wrapper = document.createElement("div");
    wrapper.className = "item-name";
    if (item.gif) {
      const image = document.createElement("img");
      image.className = "item-gif";
      image.src = item.gif;
      image.alt = `Imagem de ${item.name}`;
      image.loading = "lazy";
      image.addEventListener("error", () => image.remove());
      wrapper.append(image);
    }
    const name = document.createElement("span");
    name.textContent = item.name;
    wrapper.append(name);
    cell.append(wrapper);
    return cell;
  }

  function quantityAsNumber(value) {
    if (!value || value === "—") return 0;
    const digits = String(value).match(/-?[\d.,]+/);
    if (!digits) return 0;
    const integer = Number(digits[0].replace(/[^\d-]/g, ""));
    return Number.isFinite(integer) ? integer : 0;
  }

  function render(items, shouldScroll = true) {
    const body = document.querySelector("#items-body");
    body.replaceChildren();

    items.forEach(item => {
      const row = document.createElement("tr");
      row.append(createNameCell(item), createCell(item.size), createCell(item.power), createCell(item.bonus), createCell(item.quantity));
      const saleCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = "sale-status " + (item.sellable === "Sim" ? "sale-yes" : item.sellable === "Não" ? "sale-no" : "sale-unknown");
      status.textContent = item.sellable;
      saleCell.append(status);
      row.append(saleCell);
      body.append(row);
    });

    document.querySelector("#count").textContent = `${items.length} ${items.length === 1 ? "item" : "itens"}`;
    const totalQuantity = items.reduce((total, item) => total + quantityAsNumber(item.quantity), 0);
    document.querySelector("#total-quantity").textContent = `${totalQuantity.toLocaleString("pt-BR")} ${totalQuantity === 1 ? "unidade" : "unidades"} no total`;
    document.querySelector("#results").hidden = false;
    if (shouldScroll) document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function sortItems(items, field, direction) {
    const multiplier = direction === "asc" ? 1 : -1;
    return [...items].sort((a, b) =>
      String(a[field]).localeCompare(String(b[field]), "pt-BR", { sensitivity: "base", numeric: true }) * multiplier
    );
  }

  function sortByField(button) {
    if (!currentItems.length) return;
    const field = button.dataset.sortField;
    activeSortDirection = activeSortField === field && activeSortDirection === "asc" ? "desc" : "asc";
    activeSortField = field;
    const sorted = sortItems(currentItems, field, activeSortDirection);

    document.querySelectorAll(".sort-button").forEach(sortButton => {
      const isActive = sortButton === button;
      sortButton.closest("th").setAttribute("aria-sort", isActive ? (activeSortDirection === "asc" ? "ascending" : "descending") : "none");
      sortButton.querySelector(".sort-arrow").textContent = isActive ? (activeSortDirection === "asc" ? "↑" : "↓") : "↕";
      const nextOrder = isActive && activeSortDirection === "asc" ? "decrescente" : "crescente";
      sortButton.setAttribute("aria-label", `Ordenar por ${sortButton.dataset.sortLabel} em ordem ${nextOrder}`);
    });
    render(sorted, false);
  }

  function calculate() {
    const raw = document.querySelector("#raw-data").value;
    const message = document.querySelector("#message");
    const items = parseMinerDetails(raw);
    if (!raw.trim()) {
      message.textContent = "Cole os dados dos itens antes de calcular.";
      document.querySelector("#results").hidden = true;
      return;
    }
    if (!items.length) {
      message.textContent = "Não encontrei “Miner details”. Confira o texto colado e tente novamente.";
      document.querySelector("#results").hidden = true;
      return;
    }
    message.textContent = "";
    currentItems = items;
    activeSortField = null;
    activeSortDirection = null;
    document.querySelectorAll(".sort-button").forEach(button => {
      button.querySelector(".sort-arrow").textContent = "↕";
      button.closest("th").setAttribute("aria-sort", "none");
      button.setAttribute("aria-label", `Ordenar por ${button.dataset.sortLabel} em ordem crescente`);
    });
    render(items);
  }

  if (typeof document !== "undefined") {
    document.querySelector("#calculate").addEventListener("click", calculate);
    document.querySelectorAll(".sort-button").forEach(button => {
      button.addEventListener("click", () => sortByField(button));
    });
    document.querySelector("#raw-data").addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") calculate();
    });
  }

  if (typeof module !== "undefined") module.exports = { parseMinerDetails, sortItems, quantityAsNumber };
})();
