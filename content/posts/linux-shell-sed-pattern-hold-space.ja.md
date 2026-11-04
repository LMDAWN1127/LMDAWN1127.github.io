---
title: "Linux sed ストリームエディタ実践：Pattern Space と Hold Space"
date: 2026-11-04T14:10:00+08:00
draft: false
author: "DAWN"
tags: ["Shell", "sed", "Linux"]
categories: ["Shell", "Linux"]
showToc: true
summary: "Linux 三種の神器である sed ストリームエディタの中核アーキテクチャを徹底解説。一般的なオプションと編集アクションを体系的に整理し、パターン空間（Pattern Space）とホールド空間（Hold Space）の相互作用メカニズムを深掘りし、複数編集、条件反転選択、および設定ファイルの一括クリーンアップ手法を実戦形式で解説。"
---

# Linux sed ストリームエディタ実践：Pattern Space と Hold Space

sed（Stream Editor）は、テキスト内容を1行ずつ処理する非対話型のストリームエディタです。

テキストを処理する際、sed は現在処理中の行を一時バッファに保存します。このバッファは「パターン空間」（Pattern Space）と呼ばれます。続いて指定された sed コマンドでバッファ内の内容を処理し、処理完了後にバッファ内容を画面に出力します。その後、次の行を読み込んで処理し、ファイルの末尾までこのサイクルを繰り返します。`-i` パラメータを使用するかリダイレクトで出力を保存しない限り、sed が元のファイルを変更することはありません。

---

## 一、sed 構文形式とコアパラメータ

### 1. コマンド基本形式
```bash
sed [options] 'command' file(s)
```

### 2. sed 正規表現サポート
sed は正規表現を使用した行やテキストパターンのマッチングをサポートしています：
- **基本メタ文字セット（BRE）**：`^`, `$`, `.`, `*`, `[]`, `[^]`, `\<`, `\>`, `\(\)`, `\{\}`
- **拡張メタ文字セット（ERE）**：`?`, `+`, `{ }`, `|`, `( )`（`sed -r` を使用するか、基本モードでバックスラッシュエスケープ `\+` を使用する必要があります）

### 3. sed オプションパラメータ（options）
- `-e`：複数項目の編集を許可（1行のコマンド内で複数の編集スクリプトを実行）
- `-n`：デフォルトのパターン空間出力を抑制（通常は `p` コマンドと併用）
- `-i`：ソースファイルの内容を直接変更
- `-r`：拡張正規表現（ERE）をサポート（`+`、`?`、`()` などの記号のエスケープが不要）

### 4. sed 組み込みコマンドアクション
| コマンド | 説明 |
| :--- | :--- |
| `p` | パターン空間の内容を出力 |
| `a` | 現在の行の後にテキストを追加 |
| `i` | 現在の行の前にテキストを挿入 |
| `c` | 現在の行全体を新しいテキストに置換変更 |
| `d` | パターン空間内の内容を削除し、直ちに次の行を読み込む |
| `n` | 次の入力行を読み込み、次のコマンドから処理を開始 |
| `w` | マッチした行を外部の新規ファイルに書き出す |
| `!` | 選択された行以外のすべての行に対してコマンドを実行（反転選択） |
| `h` | パターン空間（Pattern Space）の内容をホールド空間（Hold Space）に上書き保存 |
| `H` | パターン空間の内容をホールド空間に追加 |
| `g` | ホールド空間の内容を取り出してパターン空間を上書き |
| `G` | ホールド空間の内容を取り出してパターン空間の後ろに追加 |
| `x` | パターン空間とホールド空間の内容を交換 |

---

## 二、基本編集操作：複数編集とCRUD

テストサンプルは `dawn` ホスト上の `/root/passwd` および `/etc/hosts` を例とします

### 1. 複数項目編集操作
#### 方法 1：パイプラインカスケード処理
```bash
[root@dawn ~]# sed '1,9d' /root/passwd | sed 's#root#dawn#g'
```

#### 方法 2：`-e` パラメータの組み合わせ
```bash
[root@dawn ~]# sed -e '1,9d' -e 's#root#dawn#g' /root/passwd
```

---

### 2. 出力コマンド `p`
#### (1) halt にマッチする行を出力
```bash
[root@dawn ~]# sed -n '/halt/p' /root/passwd
halt:x:7:0:halt:/sbin:/sbin/halt
```

#### (2) 2行目を出力
```bash
[root@dawn ~]# sed -n '2p' /root/passwd
bin:x:1:1:bin:/bin:/sbin/nologin
```

#### (3) 最終行を出力
```bash
[root@dawn ~]# sed -n '$p' /root/passwd
```

---

### 3. 追加コマンド `a` と挿入コマンド `i`
- `a`（append）：対象行の下に内容を追加
- `i`（insert）：対象行の上に内容を挿入

#### (1) 2行目の下に新しい設定を追加
```bash
[root@dawn ~]# sed '2a listen 80;' /root/passwd
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
listen 80;
daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

#### (2) 2行目の上に新しい設定を挿入
```bash
[root@dawn ~]# sed '2i listen 80;' /root/passwd
root:x:0:0:root:/root:/bin/bash
listen 80;
bin:x:1:1:bin:/bin:/sbin/nologin
```

---

### 4. 行全体の置換コマンド `c`
#### (1) 行番号を指定して行全体を置換
```bash
[root@dawn ~]# sed '7c SELINUX=Disabled' /etc/selinux/config
```

#### (2) 正規表現マッチで位置特定後に行全体を置換
```bash
[root@dawn ~]# sed '/^SELINUX=/c SELINUX=Disabled' /etc/selinux/config
```

#### (3) 企業実戦：非対話型システム設定変更
```bash
[root@dawn ~]# sed -ri '/UseDNS/cUseDNS no' /etc/ssh/sshd_config
[root@dawn ~]# sed -ri '/GSSAPIAuthentication/c#GSSAPIAuthentication no' /etc/ssh/sshd_config
[root@dawn ~]# sed -ri '/^SELINUX=/cSELINUX=disabled' /etc/selinux/config
```

---

### 5. 削除コマンド `d`
#### (1) 特定の単一行を削除（例：3行目、ソースファイルには影響なし）
```bash
[root@dawn ~]# sed '3d' /root/passwd
```

#### (2) 3行目から最終行まで削除
```bash
[root@dawn ~]# sed '3,$d' /root/passwd
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
```

#### (3) 最終行を削除
```bash
[root@dawn ~]# sed '$d' /root/passwd
```

#### (4) すべての内容を削除
```bash
[root@dawn ~]# sed '1,$d' /root/passwd
```

#### (5) 指定パターンに一致する行を削除
```bash
[root@dawn ~]# sed '/mail/d' /root/passwd
```

---

### 6. ファイル書き出しコマンド `w`
#### (1) マッチした行を新規ファイルに書き出す
```bash
[root@dawn ~]# sed -n '/root/w newfile' /root/passwd
[root@dawn ~]# cat newfile
root:x:0:0:root:/root:/bin/bash
```

#### (2) 2行目を個別に抽出して新規ファイルに書き出す
```bash
[root@dawn ~]# sed -n '2w newfile' /root/passwd
```

---

### 7. 複数行処理コマンド `n`
`n` は次の行をパターン空間に読み込み、後続のコマンドが次の行に作用するようにします

#### (1) root 行にマッチ後、root の次の行を削除
```bash
[root@dawn ~]# sed '/root/{n;d}' /root/passwd
```

#### (2) root 行にマッチ後、その次の行の内容を置換
```bash
[root@dawn ~]# sed '/root/{n; s/bin/dawn/}' /root/passwd
```

---

## 三、高度アーキテクチャ：Pattern Space と Hold Space 原理解説

### 1. sed 実行フローメカニズム
sed はストリーム指向の行エディタです。ストリーム指向とは、標準入力を受け取り、1行ずつ読み込んで標準出力に出力することを指します。

具体的なプロセスは以下の通りです：sed は処理対象の行を一時バッファ（パターン空間 Pattern Space）に読み込み、sed スクリプト内のコマンドが順次このバッファに作用します。すべてのコマンド処理が完了すると、バッファ内容を画面に出力し、Pattern Space をクリアします。続いて次の行を読み込み、ファイル末尾まで上記のサイクルを繰り返します。

### 2. Pattern Space と Hold Space の概念
- **Pattern Space（パターン空間）**：**作業場**に相当し、sed は現在読み込んだ行をここに配置して加工処理を行います。
- **Hold Space（ホールド空間）**：**倉庫**に相当し、加工処理中の一時的な半製品データを保管するために使用されます。

### 3. 高度空間操作命令
- `h`：Pattern Space の内容を Hold Space に上書き
- `H`：Pattern Space の内容を Hold Space に追加
- `g`：Hold Space の内容を取り出して Pattern Space を上書き
- `G`：Hold Space の内容を取り出して Pattern Space に追加
- `x`：Pattern Space と Hold Space の内容を相互交換

### 4. 空間操作クラシックケース実戦

#### ケース 1：1行目を一時保存領域に書き込み、最終行を置換
```bash
[root@dawn ~]# sed '1h;$g' /etc/hosts
```

#### ケース 2：1行目を一時保存領域に書き込み、最終行の後に追加呼び出し
```bash
[root@dawn ~]# sed '1h;$G' /etc/hosts
```

#### ケース 3：1行目を削除して一時保存領域に保持し、最終行の後に追加
```bash
[root@dawn ~]# sed -r '1{h;d};$G' /etc/hosts
```

#### ケース 4：1行目を一時保存領域に書き込み、2行目以降をすべて1行目で置換
```bash
[root@dawn ~]# sed -r '1h;2,$g' /etc/hosts
```

#### ケース 5：ファイルの逆順並べ替え実戦 `sed '1!G;h;$!d'`
- `1!G`：1行目では G 追加を実行せず（先頭行に余分な空改行が入るのを防ぐ）、2行目からホールド領域の内容を追加。
- `h`：現在のパターン空間の内容をホールド領域に保存。
- `$!d`：最終行を除き、各行の処理完了後はパターン空間をクリアして出力しない。

```bash
[root@dawn ~]# cat << EOF > /root/num.txt
1 1 1
2 2 2
3 3 3
EOF

[root@dawn ~]# sed '1!G;h;$!d' /root/num.txt
3 3 3
2 2 2
1 1 1
```

---

## 四、条件反転選択と高度正規表現置換

### 1. 反転選択コマンド `!`
#### 3行目以外のすべての行を削除
```bash
[root@dawn ~]# sed -r '3!d' /etc/hosts
```

---

### 2. マッチング置換コマンド `s` 応用
- 構文：`s/pattern/replacement/flags`
- よく使われる flags：
  - `g`：行内のすべてのマッチ項目をグローバル置換
  - `i`：大文字・小文字を区別せずマッチ
  - `&`：直前の正規表現でマッチした完全な内容を表す

#### (1) 各行で最初に出現する文字を置換
```bash
[root@dawn ~]# sed 's/root/alice/' /root/passwd
```

#### (2) 行頭の一致項目のみを置換
```bash
[root@dawn ~]# sed 's/^root/alice/' /root/passwd
```

#### (3) マッチ行の後に指定文字列を追加（`&` を使用）
```bash
[root@dawn ~]# sed -r 's/[0-9][0-9]$/& .5/' /root/passwd
```

#### (4) グローバル置換と大文字・小文字無視
```bash
[root@dawn ~]# sed -r 's/root/alice/g' /root/passwd
[root@dawn ~]# sed -r 's/root/alice/gi' /root/passwd
```

#### (5) 正規表現グループ化と後方参照（Backreference）
丸括弧 `()` でグループ化し、後方参照は `\1`, `\2` で呼び出します：
```bash
[root@dawn ~]# sed -r 's#(root)#\1-alice#g' /root/passwd
```

システム IP アドレス抽出実戦：
```bash
[root@dawn ~]# ip addr show eth0 | grep "inet " | sed -r 's#^.*inet ([0-9.]+)/.*$#\1#'
101.133.147.148
```

#### (6) パス置換区切り文字のテクニック
置換内容に大量のスラッシュ `/`（パスなど）が含まれる場合、通常の区切り文字 `/` の代わりに `#` または `@` を使用することを推奨します：
```bash
[root@dawn ~]# sed -r 's#/etc/abc/456#/dev/null#g' a.txt
[root@dawn ~]# sed -r 's@/etc/abc/456@/dev/null@g' a.txt
```

---

## 五、設定ファイルの一括クリーンアップとコメント管理

テストサンプル `/root/file` の内容は以下の通りです：
```bash
[root@dawn ~]# cat /root/file
# This is a sample config
   # Tabbed comment
#Another comment

listen 80;
server_name localhost;
```

### 1. コメント行および空行のフィルタリングと削除
#### (1) 行頭の `#` コメントを削除（スペースやタブを含むコメントは削除不可）
```bash
[root@dawn ~]# sed '/^#/d' /root/file
```

#### (2) タブまたはスペースで始まるコメント行を正確に削除
```bash
[root@dawn ~]# sed -r '/^[ \t]*#/d' /root/file
```

#### (3) 内容のない空行を削除
```bash
[root@dawn ~]# sed -r '/^[ \t]*$/d' /root/file
```

#### (4) すべてのコメント行および純粋な空行を一括削除（企業高頻度利用）
```bash
[root@dawn ~]# sed -r '/^[ \t]*#/d; /^[ \t]*$/d' /root/file
listen 80;
server_name localhost;
```
同等の構文：
```bash
[root@dawn ~]# sed -r '/^[ \t]*($|#)/d' /root/file
listen 80;
server_name localhost;
```

---

### 2. コメント文字の一括追加と管理
#### (1) 2行目から4行目に `#` コメントを追加
```bash
[root@dawn ~]# sed '2,4s/^/#/' /root/file
```

#### (2) インデント行に対して標準化されたコメントを追加
```bash
[root@dawn ~]# sed -r '2,5s/^[ \t]*#*/# /' /root/file
```
