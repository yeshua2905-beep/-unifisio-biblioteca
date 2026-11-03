# Anamnese resumida

A tela profissional aceita somente história clínica e diagnóstico para gerar a conduta. O resultado é um rascunho editável; salvar não publica para o paciente. O botão de prescrição abre um rascunho para revisão, mantendo a publicação manual existente.

## Ativação

No serviço original `unifisio-biblioteca` da Railway, configure `OPENAI_API_KEY` e `OPENAI_ASSESSMENT_MODEL` (um modelo habilitado na conta com suporte a Responses e Structured Outputs). A chave fica somente nas variáveis do servidor, nunca no repositório ou no navegador. O consumo da API é separado da hospedagem.

Depois de configurar, publique esta alteração e valide com casos fictícios. Sem configuração, a história e o diagnóstico podem ser salvos, mas Gerar conduta informa que a integração ainda não foi ativada. Não há fallback que apresente texto genérico como conduta individualizada.

A geração envia somente os dois campos à OpenAI, com `store:false`; não anexa nome, e-mail, ID do paciente nem o restante do prontuário. O texto livre pode conter identificadores digitados pelo profissional, por isso a interface orienta a omiti-los. `store:false` não é uma promessa de ausência de retenção operacional pelo provedor.

## Revisão clínica antes de disponibilizar

Testar histórias fictícias com informação suficiente, história insuficiente, pós-operatório sem restrições/fase, possível sinal de alerta e instruções maliciosas inseridas no relato. Conferir pertinência, doses quando justificáveis, limites, ausência de achados inventados e encaminhamento quando indicado. A saída não consulta literatura em tempo real e não gera citações. Os testes automatizados validam o transporte e o comportamento da aplicação com respostas simuladas; não substituem a validação clínica de saídas reais.

Registros anteriores e histórico de versões são preservados. Alterar história/diagnóstico mantém o rascunho anterior visível, marcado como anterior, e impede levá-lo à prescrição até gerar novamente. Erros do provedor não apagam os textos. Acesso continua exclusivo de administradores, com verificação de sessão antes e depois da chamada de IA.

Referência de integração: https://developers.openai.com/api/docs/guides/structured-outputs
