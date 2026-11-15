const categories = document.querySelectorAll('.categories details');

function closeCategories(except) {
  categories.forEach((category) => {
    if (category !== except) {
      category.open = false;
      category.dataset.pinned = 'false';
    }
  });
}

categories.forEach((category) => {
  const summary = category.querySelector('summary');

  category.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') {
      closeCategories(category);
      category.open = true;
    }
  });

  category.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && category.dataset.pinned !== 'true' && !category.contains(document.activeElement)) {
      category.open = false;
    }
  });

  summary.addEventListener('click', (event) => {
    event.preventDefault();
    const shouldOpen = !category.open || category.dataset.pinned !== 'true';
    closeCategories(category);
    category.open = shouldOpen;
    category.dataset.pinned = String(shouldOpen);
  });

  category.addEventListener('focusout', (event) => {
    if (!category.contains(event.relatedTarget) && category.dataset.pinned !== 'true' && !category.matches(':hover')) {
      category.open = false;
    }
  });
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.categories')) {
    closeCategories();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const openCategory = Array.from(categories).find((category) => category.open);
    closeCategories();
    if (openCategory) openCategory.querySelector('summary').focus();
  }
});
