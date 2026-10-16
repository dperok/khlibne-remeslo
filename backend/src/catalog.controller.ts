import { Controller, Get, Query } from '@nestjs/common';
import { ContentService } from './content.service.js';
import { createCatalogSearch } from './catalog-search.js';

@Controller()
export class CatalogController {
  constructor(private readonly content: ContentService) {}
  @Get('catalog')
  async getCatalog(@Query('category') category?: string, @Query('q') q?: string) {
    const state = await this.content.get();
    const matches = createCatalogSearch(q ?? '');
    const products = state.products.filter((product) => product.visible !== false &&
      (!category || category === 'all' || product.category === category) &&
      matches(`${product.name} ${product.description}`),
    );
    return { products, total: products.length, demo: state.demo };
  }

  @Get('bakery')
  async getBakery() { return (await this.content.get()).bakery; }
}
