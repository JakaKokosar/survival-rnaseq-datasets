import csv
import json
import os
import pathlib
import re


from typing import List, Optional
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent.parent
GEO = ROOT / "geo"
PROGRESS = GEO / "progress" / "rnaseq.md"
OUTPUT = ROOT / "publish" / "metadata" / "data_summary.json"


def extract_survival_var_names(description: dict) -> List[str]:
    """Extract ordered list of survival endpoint variable names from description['survival-endpoints']."""
    PLACEHOLDER_VARS = frozenset({"unknown"})
    var_names = []
    for endpoint in description.get("survival-endpoints", []):
        if "time_var" in endpoint and endpoint["time_var"].get("var_name"):
            t = endpoint["time_var"]["var_name"]
            if t not in PLACEHOLDER_VARS:
                var_names.append(t)
        if "event_var" in endpoint and endpoint["event_var"].get("var_name"):
            v = endpoint["event_var"]["var_name"]
            if v not in PLACEHOLDER_VARS:
                var_names.append(v)
    return var_names


def locate_preprocessed_sample_file(description: dict, gse_folder_path: str) -> Optional[pathlib.Path]:
    """Find preprocessed_sample file in data_file_names and return full path, or None if not found."""
    for fname in description.get("data_file_names", []):
        if "preprocessed_sample" in fname:
            full_path = pathlib.Path(gse_folder_path) / fname
            if full_path.exists():
                return full_path
    return None


def read_sample_header(sample_file_path: pathlib.Path) -> List[str]:
    """Read first row (header) from sample file. Delimiter: tab for .tab, comma for .csv."""
    suffix = sample_file_path.suffix.lower()
    delimiter = "\t" if suffix == ".tab" else ","
    with open(sample_file_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f, delimiter=delimiter)
        return next(reader, [])


def published_file_names(description: dict) -> List[str]:
    """Return canonical downloads, including the derived hallmark-score file."""
    names = list(description.get("data_file_names") or [])
    data_id = description.get("data_id")
    if data_id and any(name.endswith("_preprocessed.csv") for name in names):
        names.append(f"{data_id}_preprocessed_ssgsea.csv")
    return list(dict.fromkeys(names))


def get_data_file_metadata(description: dict, gse_folder_path: str) -> List[dict]:
    """Build cheap, web-facing size and shape metadata for published CSV files."""
    sample_count = description.get("data_summary", {}).get("samples")
    if not isinstance(sample_count, int):
        raise ValueError(f"Missing sample count for {description.get('data_id', gse_folder_path)}")

    files = []
    for filename in published_file_names(description):
        path = pathlib.Path(gse_folder_path) / filename
        if not path.is_file():
            raise FileNotFoundError(f"Missing published data file: {path}")
        files.append(
            {
                "filename": filename,
                "size_bytes": path.stat().st_size,
                "rows": sample_count,
                "columns": len(read_sample_header(path)),
            }
        )
    return files


def get_candidate_genes(header: list, survival_var_names: list) -> Optional[list]:
    """Identify survival column indices and return trailing columns as gene names.
    Uses only survival vars that exist in the header (sample file may omit some)."""
    header_lookup = {col: i for i, col in enumerate(header)}
    survival_indices = [header_lookup[v] for v in survival_var_names if v in header_lookup]
    if not survival_indices:
        return None
    max_survival_idx = max(survival_indices)
    return [header[i] for i in range(max_survival_idx + 1, len(header))]


def find_folders_with_description(parent_path):
    # Convert the string path to a Path object
    parent = pathlib.Path(parent_path)

    # Check if the parent directory exists
    if not parent.exists() or not parent.is_dir():
        print(f"Error: '{parent_path}' is not a valid directory.")
        return

    gseids = []

    for entry in sorted(parent.iterdir()):
        # Check if the entry is a directory
        if entry.is_dir():
            # Check if the target file exists within this subdirectory
            target_file = entry / 'description.json'
            if target_file.exists() and target_file.is_file():
                gseids.append(entry.name)

    return gseids



def progress_to_dict(progress_path: str):
    with open(progress_path, 'r') as f:
        raw_text = f.read()

    # Dictionary to store the results
    gse_data = {}

    # Variable to track which GSE we are currently processing
    current_gse = None

    # Iterate through the text line by line
    for line in raw_text.split('\n'):
        line = line.strip()
        
        if not line:
            continue

        if line.startswith('#'):
            continue

        # Regex to find the GSE ID: looks for [GSE12345] pattern
        gse_match = re.search(r'\[(GSE\d+)\]', line)
        
        if gse_match:
            # Found a new GSE Header
            current_gse = gse_match.group(1)
            gse_data[current_gse] = {}
        
        elif current_gse and line.startswith('-'):
            # Processing bullet points for the current GSE
            

            # Group 1 is the Key, Group 2 is the Value
            key_val_match = re.search(r'\*\*(.*?):\*\*\s*(.*)', line)
            
            if key_val_match:
                key = key_val_match.group(1)
                value = key_val_match.group(2)
                gse_data[current_gse][key] = value

    return gse_data


def read_description(file_path: str):
    with open(os.path.join(file_path, 'description.json'), 'r') as f:
        description = json.load(f)
    return description




if __name__ == "__main__":
    folder_to_search = str(GEO)
    
    gseids = find_folders_with_description(folder_to_search)
    progress_data = progress_to_dict(str(PROGRESS))

    # Filter out GSEs with "- **Include:** NO"
    # We assume Include is always present.
    progress_data = {gse_id: pdata for gse_id, pdata in progress_data.items() if pdata["Include"] == "YES"}
    # orange_embeded_urls = orange_embeded_urls(os.path.join(folder_to_search, 'orange_embeded_urls.json'))

    data = []
    
    for gseid in [gseid for gseid in gseids if gseid in progress_data]:
        gse_folder = os.path.join(folder_to_search, gseid)
        description = read_description(gse_folder)
        survival_var_names = extract_survival_var_names(description)
        candidate_genes = []
        sample_path = locate_preprocessed_sample_file(description, gse_folder)
        if sample_path and survival_var_names:
            header = read_sample_header(sample_path)
            if header:
                genes = get_candidate_genes(header, survival_var_names)
                if genes is not None:
                    candidate_genes = genes
        description["candidate_genes"] = candidate_genes
        description["data_files"] = get_data_file_metadata(description, gse_folder)
        description.update(progress_data[gseid])
        data.append(description)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open('w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        f.write('\n')
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
