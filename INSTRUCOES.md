# Biblioteca Clínica Unifisio — versão independente

Este pacote contém o sistema pronto para instalar. Ele ainda não substitui o endereço anterior: a publicação depende de uma hospedagem ou servidor externo e de um endereço definido pelo proprietário.

## O que está pronto

- Login com e-mail e senha, sem conta de serviços externos.
- Cadastro por convite individual, válido por 7 dias e utilizável uma única vez.
- Administrador: consulta, cadastro, edição, aprovação, devolução, arquivamento e gestão de profissionais.
- Profissional: consulta materiais publicados, sugere novos materiais e edita as próprias sugestões enquanto pendentes ou devolvidas.
- Somente leitura: consulta os materiais publicados.
- Suspensão e reativação de profissionais, troca de permissões e recuperação de senha por link.
- Cadastro de referências, links, resumos e PDF de até 15 MB.
- Armazenamento compartilhado e persistente, usando um banco SQLite e uma pasta de arquivos no servidor.
- Layout para celular e computador, categorias clínicas e busca.

Os convites e links de recuperação são copiados pelo administrador e enviados por ele ao destinatário. O sistema não envia e-mails automaticamente. O cadastro não é aberto ao público. O acesso por link de convite é para o e-mail especificado; entregue esse link apenas ao profissional destinatário.

## Para quem administra a Unifisio

1. Após instalar o sistema, o responsável pela hospedagem gera seu link de primeiro acesso.
2. Você abre esse link e escolhe uma senha com pelo menos 12 caracteres.
3. Em **Profissionais e permissões**, informa nome, e-mail e permissão de cada pessoa.
4. Copia o convite e envia ao profissional. Ele cria a própria senha.
5. As sugestões ficam em **Revisão** até sua aprovação. Você pode devolvê-las com uma orientação.
6. Para retirar um acesso, use **Suspender**. Para esquecimento de senha, use **Recuperar senha** e envie o link gerado, válido por uma hora.

## Instalação em hospedagem com Node.js ou contêiner

Requisitos: Node.js 24 ou posterior, HTTPS, disco persistente e possibilidade de executar comandos no servidor. O sistema deve rodar em uma única instância, com o banco e os PDFs no mesmo volume persistente. Não usar armazenamento temporário nem múltiplas réplicas independentes.

O front-end já está compilado em `dist/`. Não é necessário instalar dependências npm para executar esta distribuição. O backend usa apenas recursos nativos do Node.js.

Configure estas variáveis no ambiente da hospedagem:

```text
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://ENDERECO-REAL-DA-BIBLIOTECA
DATA_DIR=/data
```

`PUBLIC_URL` precisa ser a origem HTTPS real, sem caminho adicional. O volume persistente deve estar montado em `DATA_DIR` e ser gravável pelo processo da aplicação. Se a hospedagem exigir outra porta, configure `PORT` conforme ela orientar.

Inicie com:

```sh
node server/index.mjs
```

Ou construa o `Dockerfile` incluído, que usa os arquivos compilados sem instalar dependências. O caminho `/health` serve para verificar a disponibilidade. Em hospedagens que encerram a aplicação por inatividade ou substituem o disco a cada publicação, configure o serviço e o volume antes de usar com conteúdo real.

### Primeiro administrador

No terminal da hospedagem, dentro da pasta do projeto, usando as mesmas variáveis da aplicação:

```sh
node scripts/admin.mjs primeiro-acesso SEU_EMAIL "Carlos Santos"
```

O comando gera um link privado válido por uma hora para criar a senha. Não há senha padrão nem credencial incluída no pacote. O comando de primeiro acesso deixa de funcionar depois do primeiro cadastro.

Se o administrador perder a senha e não houver outro administrador disponível, o responsável pelo servidor pode gerar um link de recuperação:

```sh
node scripts/admin.mjs recuperar SEU_EMAIL
```

### Servidor próprio com domínio e Docker Compose

Aponte o DNS do domínio para o servidor e libere as portas 80 e 443. Defina `BIBLIOTECA_DOMAIN`, sem protocolo, em um arquivo `.env` criado no servidor, por exemplo:

```text
BIBLIOTECA_DOMAIN=biblioteca.seudominio.com.br
```

Execute:

```sh
docker compose up -d --build
docker compose exec biblioteca node scripts/admin.mjs primeiro-acesso SEU_EMAIL "Carlos Santos"
```

O Caddy incluído oferece HTTPS para o domínio configurado. Os volumes Docker mantêm os materiais e os dados entre reinícios. Não exclua o volume `biblioteca_data` ao atualizar a aplicação.

## Executar para demonstração local

Com Node.js 24 instalado, em um terminal da pasta do projeto:

```sh
node server/index.mjs
```

Em outro terminal:

```sh
PUBLIC_URL=http://localhost:3000 node scripts/admin.mjs primeiro-acesso SEU_EMAIL "Carlos Santos"
```

Abra o link privado gerado. Os dados ficam em `data/`. Este modo local é para demonstração; para uso online, configure HTTPS e as variáveis de produção acima. No Windows PowerShell, defina `$env:PUBLIC_URL="http://localhost:3000"` antes de executar o comando do administrador.

## Manutenção

- Configure backups periódicos do volume de dados na hospedagem.
- Para uma cópia manual consistente, pare a aplicação, copie toda a pasta `DATA_DIR` (banco, arquivos auxiliares SQLite e `uploads/`) e reinicie-a.
- Para restaurar, com a aplicação parada, restaure a pasta completa no volume e preserve as permissões de escrita.
- As senhas são armazenadas com scrypt e salt. Os tokens de sessão e de convite são armazenados somente como hash. A sessão usa cookie HttpOnly, SameSite e Secure em produção.
- As permissões são verificadas no servidor, incluindo downloads, sugestões e administração. A suspensão invalida as sessões do profissional.
- Não utilize contas compartilhadas. Cada profissional recebe sua própria conta.

## Alterar ou desenvolver o sistema

O código-fonte do front-end está em `frontend/`; o backend em `server/`. Para recompilar a interface, instale as dependências com `npm install` e execute `npm run build`. Para validar os fluxos de acesso e os dados: `npm test`.

## Estado desta entrega

Compilação da interface e testes de integração passaram. Os testes cobrem autenticação, convites de uso único, permissões, revisão, bloqueio de arquivos privados, edição de sugestões, suspensão, recuperação de senha, persistência e limite de tentativas de login. Não foi realizada publicação em uma hospedagem externa nem validação visual em navegador nesta entrega.

O site anterior permanece separado. Antes de encerrar seu uso, copie quaisquer materiais que tenham sido cadastrados nele. Não há importação automática de contas ou senhas da versão anterior.
