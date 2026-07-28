#!/usr/bin/env python3
import base64
import pathlib
import sys


def main() -> int:
    if len(sys.argv) < 4:
        return 64
    template_path = pathlib.Path(sys.argv[1])
    output_path = pathlib.Path(sys.argv[2])
    rendered = template_path.read_text(encoding="utf-8")
    for mapping in sys.argv[3:]:
        placeholder, separator, source = mapping.partition("=")
        if separator != "=" or not placeholder or not source:
            return 65
        if rendered.count(placeholder) != 1:
            return 66
        encoded = base64.b64encode(pathlib.Path(source).read_bytes()).decode("ascii")
        rendered = rendered.replace(placeholder, encoded)
    output_path.write_text(rendered, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
