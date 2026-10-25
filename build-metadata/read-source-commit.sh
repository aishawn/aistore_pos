#!/bin/sh
set -eu

git_dir=${1:?Git metadata directory is required}
if [ -f "$git_dir" ]; then
  gitdir_line=$(sed -n '1p' "$git_dir")
  case "$gitdir_line" in
    "gitdir: "*) git_dir=${gitdir_line#gitdir: } ;;
    *) echo "Git metadata file is not a gitdir pointer" >&2; exit 1 ;;
  esac
fi
head_file="$git_dir/HEAD"
[ -r "$head_file" ] || { echo "Git HEAD is unavailable" >&2; exit 1; }
head=$(sed -n '1p' "$head_file")
ref_dir=$git_dir
if [ -r "$git_dir/commondir" ]; then
  common_dir=$(sed -n '1p' "$git_dir/commondir")
  case "$common_dir" in
    /*) ref_dir=$common_dir ;;
    *) ref_dir="$git_dir/$common_dir" ;;
  esac
fi

if printf '%s\n' "$head" | grep -Eq '^[a-f0-9]{40}$'; then
  commit=$head
else
  case "$head" in
    "ref: refs/"*) ref=${head#ref: } ;;
    *) echo "Git HEAD is not a commit or ref" >&2; exit 1 ;;
  esac
  case "$ref" in
    *..*|*\\*|/*) echo "Git ref is invalid" >&2; exit 1 ;;
  esac
  if [ -r "$git_dir/$ref" ]; then
    commit=$(sed -n '1p' "$git_dir/$ref")
  elif [ -r "$ref_dir/$ref" ]; then
    commit=$(sed -n '1p' "$ref_dir/$ref")
  elif [ -r "$ref_dir/packed-refs" ]; then
    commit=$(awk -v ref="$ref" '$2 == ref { print $1; exit }' "$ref_dir/packed-refs")
  else
    commit=
  fi
fi

printf '%s\n' "$commit" | grep -Eq '^[a-f0-9]{40}$' || { echo "Git ref does not resolve to a full SHA" >&2; exit 1; }
printf '%s\n' "$commit"
