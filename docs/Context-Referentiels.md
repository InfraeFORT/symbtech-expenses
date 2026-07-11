# Context-Referentiels.md — Société & Fournisseur (ajouts paie/fiscal)

## Société (`models/Company.js`, `pages/Companies.jsx`)
- Bloc « Paie & déclarations sociales » : `apeCode`, `urssafNumber` (URSSAF/ERN MRA), `conventionCollective` — reportés dans l'employeur du bulletin.
- `imageKey` : logo société. Upload via l'option `image` du `crudRouter` (`/companies/:id/image`, URL signée, suppression), S3. Uploader dans la fiche (après enregistrement). Affiché sur le bulletin.

## Fournisseur (`models/Supplier.js`, `pages/Suppliers.jsx`)
- Personne physique (`isIndividual`) : civility, firstName, lastName, birthDate, nationalId ; masque N° RC/Reg et TVA.
- Salarié (`isEmployee`, coche au-dessus des Contacts) : `employment` — country(FR/MU), currency, contractType, startDate, position, classification, coefficient, isCadre, workedHours, annualGross, monthlyGross (= annuel / monthsPerYear), monthsPerYear (12 + mois supplémentaires), bonuses[{label,amount,recurring}].
- Pré-remplit le bulletin : pays, devise, brut mensuel, poste/classification/coefficient/statut, date d'entrée, primes récurrentes.
