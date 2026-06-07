import {
  ComposicaoItem,
  ComposicaoPropria,
  Etapa,
  InsumoProprio,
  Material,
  Medicao,
  Obra,
  Orcamento,
  OrcamentoItem,
  Profile,
  SinapiComposicao,
  SinapiComposicaoItem,
  SinapiInsumo,
} from '@/lib/types'

export type LocalDatabase = {
  profiles: Profile[]
  obras: Obra[]
  orcamentos: Orcamento[]
  orcamento_itens: OrcamentoItem[]
  etapas: Etapa[]
  materiais: Material[]
  medicoes: Medicao[]
  sinapi_insumos: SinapiInsumo[]
  sinapi_composicoes: SinapiComposicao[]
  sinapi_composicao_itens: SinapiComposicaoItem[]
  composicoes_proprias: ComposicaoPropria[]
  composicao_insumos: ComposicaoItem[]
  insumos_proprios: InsumoProprio[]
}

const now = '2026-06-07T09:00:00.000Z'
const obraId = 'local-obra-exemplo'
const orcamentoId = 'local-orcamento-exemplo'

export const LOCAL_DB_VERSION = '2026-06-07-local-v3'

export function createLocalSeed(): LocalDatabase {
  const sinapiInsumos: SinapiInsumo[] = [
    {
      id: 'sinapi-cimento',
      codigo: '00001379',
      classificacao: 'MATERIAL',
      descricao: 'Cimento Portland composto CP II-32, saco 50 kg',
      unidade: 'SC',
      origem_preco: 'C',
      precos: { SP: 34.9 },
      mes_referencia: '06/2026',
      created_at: now,
    },
    {
      id: 'sinapi-areia',
      codigo: '00000370',
      classificacao: 'MATERIAL',
      descricao: 'Areia media posto jazida/fornecedor',
      unidade: 'M3',
      origem_preco: 'C',
      precos: { SP: 118.5 },
      mes_referencia: '06/2026',
      created_at: now,
    },
    {
      id: 'sinapi-brita',
      codigo: '00004721',
      classificacao: 'MATERIAL',
      descricao: 'Pedra britada n. 1',
      unidade: 'M3',
      origem_preco: 'C',
      precos: { SP: 142.8 },
      mes_referencia: '06/2026',
      created_at: now,
    },
    {
      id: 'sinapi-pedreiro',
      codigo: '00004750',
      classificacao: 'MAO_DE_OBRA',
      descricao: 'Pedreiro horista',
      unidade: 'H',
      origem_preco: 'C',
      precos: { SP: 24.6 },
      mes_referencia: '06/2026',
      created_at: now,
    },
    {
      id: 'sinapi-servente',
      codigo: '00006111',
      classificacao: 'MAO_DE_OBRA',
      descricao: 'Servente de obras horista',
      unidade: 'H',
      origem_preco: 'C',
      precos: { SP: 18.4 },
      mes_referencia: '06/2026',
      created_at: now,
    },
    {
      id: 'sinapi-tinta',
      codigo: '00007356',
      classificacao: 'MATERIAL',
      descricao: 'Tinta latex acrilica premium',
      unidade: 'L',
      origem_preco: 'C',
      precos: { SP: 21.2 },
      mes_referencia: '06/2026',
      created_at: now,
    },
  ]

  const composicoes: ComposicaoPropria[] = [
    {
      id: 'comp-concreto',
      codigo: 'CP-001',
      descricao: 'Concreto simples dosado em obra FCK 20 MPa',
      unidade: 'M3',
      grupo: 'FUNDACAO',
      ativo: true,
      created_at: now,
    },
    {
      id: 'comp-reboco',
      codigo: 'CP-002',
      descricao: 'Reboco interno com argamassa mista',
      unidade: 'M2',
      grupo: 'REVESTIMENTO',
      ativo: true,
      created_at: now,
    },
    {
      id: 'comp-pintura',
      codigo: 'CP-003',
      descricao: 'Pintura latex acrilica em parede, duas demaos',
      unidade: 'M2',
      grupo: 'ACABAMENTO',
      ativo: true,
      created_at: now,
    },
  ]

  const composicaoInsumos: ComposicaoItem[] = [
    { id: 'ci-concreto-cimento', composicao_id: 'comp-concreto', insumo_id: 'sinapi-cimento', insumo_proprio_id: null, coeficiente: 6.4 },
    { id: 'ci-concreto-areia', composicao_id: 'comp-concreto', insumo_id: 'sinapi-areia', insumo_proprio_id: null, coeficiente: 0.55 },
    { id: 'ci-concreto-brita', composicao_id: 'comp-concreto', insumo_id: 'sinapi-brita', insumo_proprio_id: null, coeficiente: 0.75 },
    { id: 'ci-concreto-servente', composicao_id: 'comp-concreto', insumo_id: 'sinapi-servente', insumo_proprio_id: null, coeficiente: 2.2 },
    { id: 'ci-reboco-pedreiro', composicao_id: 'comp-reboco', insumo_id: 'sinapi-pedreiro', insumo_proprio_id: null, coeficiente: 0.5 },
    { id: 'ci-reboco-servente', composicao_id: 'comp-reboco', insumo_id: 'sinapi-servente', insumo_proprio_id: null, coeficiente: 0.55 },
    { id: 'ci-reboco-areia', composicao_id: 'comp-reboco', insumo_id: 'sinapi-areia', insumo_proprio_id: null, coeficiente: 0.018 },
    { id: 'ci-pintura-tinta', composicao_id: 'comp-pintura', insumo_id: 'sinapi-tinta', insumo_proprio_id: null, coeficiente: 0.22 },
    { id: 'ci-pintura-pedreiro', composicao_id: 'comp-pintura', insumo_id: 'sinapi-pedreiro', insumo_proprio_id: null, coeficiente: 0.18 },
  ]

  return {
    profiles: [{
      id: 'local-profile',
      name: 'Usuário Local',
      photo_url: null,
      theme_color: '#3B7BF8',
      dark_mode: true,
      onboarding_done: true,
      password_hash: null,
      created_at: now,
    }],
    obras: [{
      id: obraId,
      nome: 'Obra Exemplo Local',
      endereco: 'Rua de Teste, 100, Centro, Sao Paulo',
      foto_url: null,
      status: 'ativa',
      data_inicio: '2026-06-10',
      data_previsao: '2026-09-30',
      responsavel: 'Eng. Teste Local',
      area_m2: 84,
      uf: 'SP',
      created_at: now,
    }],
    orcamentos: [{
      id: orcamentoId,
      obra_id: obraId,
      tipo: 'executivo',
      bdi_percentual: 22,
      status: 'rascunho',
      versao: 1,
      created_at: now,
    }],
    orcamento_itens: [
      {
        id: 'orc-item-concreto',
        orcamento_id: orcamentoId,
        etapa_id: 'etapa-fundacoes',
        subetapa: 'Sapatas',
        composicao_id: 'comp-concreto',
        sinapi_composicao_id: null,
        quantidade: 6,
        preco_unitario_snapshot: 436.12,
        descricao_snapshot: 'Concreto simples dosado em obra FCK 20 MPa - Sapatas',
        codigo_snapshot: 'CP-001',
        unidade_snapshot: 'M3',
        updated_at: now,
      },
      {
        id: 'orc-item-pintura',
        orcamento_id: orcamentoId,
        etapa_id: 'etapa-acabamento',
        subetapa: 'Paredes internas',
        composicao_id: 'comp-pintura',
        sinapi_composicao_id: null,
        quantidade: 120,
        preco_unitario_snapshot: 9.09,
        descricao_snapshot: 'Pintura latex acrilica em parede, duas demaos - Paredes internas',
        codigo_snapshot: 'CP-003',
        unidade_snapshot: 'M2',
        updated_at: now,
      },
    ],
    etapas: [
      { id: 'etapa-servicos', obra_id: obraId, nome: 'Servicos preliminares', data_inicio: '2026-06-10', data_fim: '2026-06-14', status: 'planejada', ordem: 1 },
      { id: 'etapa-fundacoes', obra_id: obraId, nome: 'Fundacoes', data_inicio: '2026-06-15', data_fim: '2026-06-30', status: 'planejada', ordem: 2 },
      { id: 'etapa-acabamento', obra_id: obraId, nome: 'Acabamento', data_inicio: '2026-08-15', data_fim: '2026-09-20', status: 'planejada', ordem: 3 },
    ],
    materiais: [
      { id: 'mat-cimento', obra_id: obraId, etapa_id: 'etapa-fundacoes', sinapi_codigo: '00001379', descricao: 'Cimento Portland composto CP II-32, saco 50 kg', unidade: 'SC', quantidade_total: 38.4, quantidade_comprada: 0, status_compra: 'nao_comprado', data_necessidade: '2026-06-12' },
      { id: 'mat-tinta', obra_id: obraId, etapa_id: 'etapa-acabamento', sinapi_codigo: '00007356', descricao: 'Tinta latex acrilica premium', unidade: 'L', quantidade_total: 26.4, quantidade_comprada: 10, status_compra: 'parcial', data_necessidade: '2026-08-10' },
    ],
    medicoes: [
      { id: 'medicao-1', obra_id: obraId, etapa_id: 'etapa-servicos', periodo_inicio: '2026-06-10', periodo_fim: '2026-06-14', percentual_executado: 20, observacao: 'Medição inicial de teste local', created_at: now },
    ],
    sinapi_insumos: sinapiInsumos,
    sinapi_composicoes: [{
      id: 'sinapi-comp-alvenaria',
      codigo: '87503',
      grupo: 'ALVENARIA',
      descricao: 'Alvenaria de vedacao com bloco ceramico',
      unidade: 'M2',
      situacao: 'COM CUSTO',
      custos: { SP: 78.3 },
      mes_referencia: '06/2026',
      created_at: now,
    }],
    sinapi_composicao_itens: [
      { id: 'sci-1', composicao_codigo: '87503', mes_referencia: '06/2026', tipo: 'INSUMO', item_codigo: '00004750', item_descricao: 'Pedreiro horista', item_unidade: 'H', coeficiente: 0.7, situacao: 'COM PRECO' },
      { id: 'sci-2', composicao_codigo: '87503', mes_referencia: '06/2026', tipo: 'INSUMO', item_codigo: '00006111', item_descricao: 'Servente de obras horista', item_unidade: 'H', coeficiente: 0.9, situacao: 'COM PRECO' },
    ],
    composicoes_proprias: composicoes,
    composicao_insumos: composicaoInsumos,
    insumos_proprios: [{
      id: 'insumo-proprio-frete',
      codigo: 'IP-001',
      descricao: 'Frete local de materiais',
      unidade: 'UN',
      categoria: 'SERVICO',
      preco_unitario: 180,
      ativo: true,
      created_at: now,
    }],
  }
}
