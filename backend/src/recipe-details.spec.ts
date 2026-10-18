import { recipeDetails } from './recipe-details.js';
const item = (id: string,name: string,type='1',amount=1) => ({ingredient_id:id,ingredient_name:name,structure_type:type,structure_netto:amount});
describe('Poster recipe composition', () => {
  it('expands nested dough without confusing a prepack ID with a raw ingredient ID', () => {
    const data=recipeDetails({product_id:'55',ingredients:[item('9','Тісто','2'),item('47','Кунжут')]},[{product_id:'9',ingredients:[item('12','Борошно'),item('78','Молоко Агромол, кг') ]},{product_id:'47',ingredients:[item('53','Борошно ржане')]}]);
    expect(data.ingredients).toEqual(['борошно','молоко','кунжут']);
    expect(data.allergens).toEqual(['молоко','кунжут']); expect(data.flourUnspecified).toBe(true);
  });
  it('does not invent ingredients or declare an unknown recipe allergen-free', () => {
    expect(recipeDetails({product_id:'35'},[]).ingredients).toEqual([]);
    const data=recipeDetails({product_id:'55',ingredients:[item('99','Невідома начинка','2')]},[]);
    expect(data.unresolved).toEqual(['Невідома начинка']); expect(data.allergens).toEqual([]);
  });
  it('rejects a cyclic recipe and excludes ingredients recorded with zero quantity', () => {
    expect(()=>recipeDetails({product_id:'1',ingredients:[item('2','Тісто','2')]},[{product_id:'2',ingredients:[item('2','Тісто','2')]}])).toThrow('Circular');
    expect(recipeDetails({product_id:'1',ingredients:[item('1','Яйце','1',0)]},[]).allergens).toEqual([]);
  });
  it('does not mistake syrup for cheese or assume the contents of margarine', () => {
    expect(recipeDetails({product_id:'1',ingredients:[item('1','Сироп'),item('2','Маргарин')]},[]).allergens).toEqual([]);
  });
});
