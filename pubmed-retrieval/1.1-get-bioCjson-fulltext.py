import tarfile
import os
import ujson
import gzip
import concurrent.futures
import pandas as pd

# from helpers import pmcids_by_year

tarfile_paths = [
    'PMC000XXXXX_json_unicode.tar.gz',
    'PMC030XXXXX_json_unicode.tar.gz',
    'PMC035XXXXX_json_unicode.tar.gz',
    'PMC040XXXXX_json_unicode.tar.gz',
    'PMC045XXXXX_json_unicode.tar.gz',
    'PMC050XXXXX_json_unicode.tar.gz',
    'PMC055XXXXX_json_unicode.tar.gz',
    'PMC060XXXXX_json_unicode.tar.gz',
    'PMC065XXXXX_json_unicode.tar.gz',
    'PMC070XXXXX_json_unicode.tar.gz',
    'PMC075XXXXX_json_unicode.tar.gz',
    'PMC080XXXXX_json_unicode.tar.gz',
    'PMC085XXXXX_json_unicode.tar.gz',
    'PMC090XXXXX_json_unicode.tar.gz',
    'PMC095XXXXX_json_unicode.tar.gz',
    'PMC100XXXXX_json_unicode.tar.gz',
    'PMC105XXXXX_json_unicode.tar.gz',
    'PMC110XXXXX_json_unicode.tar.gz',
    'PMC115XXXXX_json_unicode.tar.gz',
    'PMC120XXXXX_json_unicode.tar.gz',
    'PMC125XXXXX_json_unicode.tar.gz',
    'PMC130XXXXX_json_unicode.tar.gz'
]

JOBS = 1
OUTPUT_DIR = 'rna_seq_data/bioCjson_raw'
os.makedirs(OUTPUT_DIR, exist_ok=True)

def extract_tar_contents(tarfile_path):
    extracted_files = {}
    with tarfile.open(tarfile_path, 'r:gz') as tar:
        for member in tar.getmembers():
            f = tar.extractfile(member)
            if f is not None:
                content = f.read()
                extracted_files[member.name] = content
    return extracted_files

def process_batch(batch):
    extracted_files = {}

    with concurrent.futures.ProcessPoolExecutor(max_workers=JOBS) as executor:
        results = executor.map(extract_tar_contents, batch)
    
        for result in results:
            extracted_files.update(result)


    print(f'Extracted {len(extracted_files)} files.')


    df = pd.read_csv('rna_seq_data/rna_seq_gds_with_publication_filtered.csv')
    pmcids = set(df['pmcids'].str.split(";").explode())
    
    for pmcid in pmcids:
        fname = f'{pmcid}.xml'
        data = extracted_files.get(fname, None)

        if data is None:
            continue
        
        file_path = f'{OUTPUT_DIR}/{pmcid}.json.gz'
        with gzip.open(file_path, 'wt') as f: 
            ujson.dump(ujson.loads(data), f)
    
    print(f'Finished processing for batch {batch}')
    

def main():
    archive_paths = [f'raw-data/{raw_file_path}' for raw_file_path in tarfile_paths]
    missing_paths = [path for path in archive_paths if not os.path.exists(path)]
    if missing_paths:
        raise FileNotFoundError(
            "Missing BioC archive(s). Run `bash raw-data/download.sh` first. "
            f"First missing file: {missing_paths[0]}"
        )

    for i in range(0, len(archive_paths), JOBS):
        batch = archive_paths[i:i+JOBS]
        print("Working on batch {}".format(batch))
        process_batch(batch)


if __name__ == '__main__':
    main()
