/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import "regenerator-runtime"; // needed for some of react-spectrum
import React, { useState } from "react";
import { object, array, string, number, lazy } from "yup";
import { FieldArray } from "formik";
import Textfield from "@react/react-spectrum/Textfield";
import RadioGroup from "@react/react-spectrum/RadioGroup";
import Radio from "@react/react-spectrum/Radio";
import Checkbox from "@react/react-spectrum/Checkbox";
import Button from "@react/react-spectrum/Button";
import Alert from "@react/react-spectrum/Alert";
import ModalTrigger from "@react/react-spectrum/ModalTrigger";
import Dialog from "@react/react-spectrum/Dialog";
import Delete from "@react/react-spectrum/Icon/Delete";
import { Accordion, AccordionItem } from "@react/react-spectrum/Accordion";
import CheckboxList from "../components/checkboxList";
import "@react/react-spectrum/Form"; // needed for spectrum form styles
import render from "../render";
import WrappedField from "../components/wrappedField";
import ExtensionView from "../components/extensionView";
import EditorButton from "../components/editorButton";
import copyPropertiesIfNotDefault from "./utils/copyPropertiesIfNotDefault";
import singleDataElementRegex from "../constants/singleDataElementRegex";
import "./configuration.styl";

const contextGranularityEnum = {
  ALL: "all",
  SPECIFIC: "specific"
};
const contextOptions = ["web", "device", "environment", "placeContext"];

const getInstanceDefaults = initInfo => ({
  name: "alloy",
  propertyId: "",
  imsOrgId: initInfo.company.orgId,
  edgeDomain: "alpha.konductor.adobedc.net",
  errorsEnabled: true,
  optInEnabled: false,
  idSyncEnabled: true,
  idSyncContainerId: "",
  destinationsEnabled: true,
  prehidingStyle: "",
  contextGranularity: contextGranularityEnum.ALL,
  context: contextOptions
});

const createDefaultInstance = initInfo =>
  JSON.parse(JSON.stringify(getInstanceDefaults(initInfo)));

const getInitialValues = ({ initInfo }) => {
  const instanceDefaults = getInstanceDefaults(initInfo);
  let { instances } = initInfo.settings || {};

  if (instances) {
    instances.forEach(instance => {
      if (instance.context) {
        instance.contextGranularity = contextGranularityEnum.SPECIFIC;
      }

      // Copy default values to the instance if the properties
      // aren't already defined on the instance. This is primarily
      // because Formik requires all fields to have initial values.
      Object.keys(instanceDefaults).forEach(key => {
        if (instance[key] === undefined) {
          instance[key] = instanceDefaults[key];
        }
      });
    });
  } else {
    instances = [createDefaultInstance(initInfo)];
  }

  return {
    instances
  };
};

const getSettings = ({ values, initInfo }) => {
  const instanceDefaults = getInstanceDefaults(initInfo);
  return {
    instances: values.instances.map(instance => {
      const trimmedInstance = {
        name: instance.name
      };

      copyPropertiesIfNotDefault(trimmedInstance, instance, instanceDefaults, [
        "propertyId",
        "imsOrgId",
        "edgeDomain",
        "errorsEnabled",
        "optInEnabled",
        "idSyncEnabled",
        "destinationsEnabled",
        "prehidingStyle"
      ]);

      if (
        instance.idSyncEnabled &&
        instance.idSyncContainerId !== instanceDefaults.idSyncContainerId
      ) {
        trimmedInstance.idSyncContainerId = instance.idSyncContainerId;

        // trimmedInstance.idSyncContainerId is most likely a string at this point. If
        // the value represents a number, we need to cast to a number.
        if (number().isValidSync(trimmedInstance.idSyncContainerId)) {
          trimmedInstance.idSyncContainerId = Number(
            trimmedInstance.idSyncContainerId
          );
        }
      }

      if (instance.contextGranularity === contextGranularityEnum.SPECIFIC) {
        trimmedInstance.context = instance.context;
      }

      return trimmedInstance;
    })
  };
};

const validateDuplicateValue = (createError, instances, key, message) => {
  const values = instances.map(instance => instance[key]);
  const duplicateIndex = values.findIndex(
    (value, index) => values.indexOf(value) < index
  );

  return (
    duplicateIndex === -1 ||
    createError({
      path: `instances[${duplicateIndex}].${key}`,
      message
    })
  );
};

const idSyncContainerIdValidationMessage =
  "Please specify a non-negative integer or data element for the container ID.";

const validationSchema = object()
  .shape({
    instances: array().of(
      object().shape({
        name: string()
          .required("Please specify a name.")
          // Under strict mode, setting window["123"], where the key is all
          // digits, throws a "Failed to set an indexed property on 'Window'" error.
          // This regex ensure there's at least one non-digit.
          .matches(/\D+/, "Please provide a non-numeric name.")
          .test({
            name: "notWindowPropertyName",
            message:
              "Please provide a name that does not conflict with a property already found on the window object.",
            test(value) {
              return !(value in window);
            }
          }),
        propertyId: string().required("Please specify a property ID."),
        imsOrgId: string().required("Please specify an IMS organization ID."),
        edgeDomain: string().required("Please specify an edge domain."),
        // A valid idSyncContainerId field value can be an integer
        // greater than or equal to 0, an empty string, or a string containing
        // a single data element token. Using `lazy` as we've done
        // here is the suggested way of handling a value that can be two
        // different types (number and string):
        // https://github.com/jquense/yup/issues/321
        idSyncContainerId: lazy(value => {
          let validator;
          if (number().isValidSync(value)) {
            validator = number().when("idSyncEnabled", {
              is: true,
              then: number()
                .integer(idSyncContainerIdValidationMessage)
                // convert empty string to a 0 so it doesn't fail subsequent rules
                .min(0, idSyncContainerIdValidationMessage)
            });
          } else {
            validator = string().when("idSyncEnabled", {
              is: true,
              then: string().matches(singleDataElementRegex, {
                message: idSyncContainerIdValidationMessage,
                excludeEmptyString: true
              })
            });
          }
          return validator;
        })
      })
    )
  })
  // TestCafe doesn't allow this to be an arrow function because of
  // how it scopes "this".
  // eslint-disable-next-line func-names
  .test("uniqueName", function(settings) {
    return validateDuplicateValue(
      this.createError.bind(this),
      settings.instances,
      "name",
      "Please provide a name unique from those used for other instances."
    );
  })
  // TestCafe doesn't allow this to be an arrow function because of
  // how it scopes "this".
  // eslint-disable-next-line func-names
  .test("uniquePropertyId", function(settings) {
    return validateDuplicateValue(
      this.createError.bind(this),
      settings.instances,
      "propertyId",
      "Please provide a property ID unique from those used for other instances."
    );
  })
  // TestCafe doesn't allow this to be an arrow function because of
  // how it scopes "this".
  // eslint-disable-next-line func-names
  .test("uniqueImsOrgId", function(settings) {
    return validateDuplicateValue(
      this.createError.bind(this),
      settings.instances,
      "imsOrgId",
      "Please provide an IMS Organization ID unique from those used for other instances."
    );
  });

const Configuration = () => {
  const [selectedAccordionIndex, setSelectedAccordionIndex] = useState(0);

  return (
    <ExtensionView
      getInitialValues={getInitialValues}
      getSettings={getSettings}
      validationSchema={validationSchema}
      render={({ formikProps, initInfo }) => {
        const {
          values,
          errors,
          isSubmitting,
          isValidating,
          setFieldValue,
          initialValues
        } = formikProps;

        // If the user just tried to save the configuration and there's
        // a validation error, make sure the first accordion item containing
        // an error is shown.
        if (isSubmitting && !isValidating && errors && errors.instances) {
          const instanceIndexContainingErrors = errors.instances.findIndex(
            instance => instance
          );
          setSelectedAccordionIndex(instanceIndexContainingErrors);
        }

        return (
          <div>
            <FieldArray
              name="instances"
              render={arrayHelpers => {
                return (
                  <div>
                    <div className="u-alignRight">
                      <Button
                        label="Add Instance"
                        onClick={() => {
                          arrayHelpers.push(createDefaultInstance(initInfo));
                          setSelectedAccordionIndex(values.instances.length);
                        }}
                      />
                    </div>
                    <Accordion
                      selectedIndex={selectedAccordionIndex}
                      className="u-gapTop2x"
                      onChange={setSelectedAccordionIndex}
                    >
                      {values.instances.map((instance, index) => (
                        <AccordionItem
                          key={index}
                          header={instance.name || "unnamed instance"}
                        >
                          <div>
                            <label
                              htmlFor="nameField"
                              className="spectrum-Form-itemLabel"
                            >
                              Name (will also be used to create a global method
                              on window)
                            </label>
                            <div>
                              <WrappedField
                                id="nameField"
                                name={`instances.${index}.name`}
                                component={Textfield}
                                componentClassName="u-fieldLong"
                                supportDataElement
                              />
                            </div>
                            {// If we're editing an existing configuration and the name changes.
                            initInfo.settings &&
                            initialValues.instances[0].name !==
                              values.instances[0].name ? (
                              <Alert
                                id="nameChangeAlert"
                                className="ConstrainedAlert"
                                header="Potential Problems Due to Name Change"
                                variant="warning"
                              >
                                Any rule components or data elements using this
                                instance will no longer function as expected
                                when running on your website. We recommend
                                removing or updating those resources before
                                publishing your next library.
                              </Alert>
                            ) : null}
                            <div />
                          </div>
                          <div className="u-gapTop">
                            <label
                              htmlFor="propertyIdField"
                              className="spectrum-Form-itemLabel"
                            >
                              Property ID
                            </label>
                            <div>
                              <WrappedField
                                id="propertyIdField"
                                name={`instances.${index}.propertyId`}
                                component={Textfield}
                                componentClassName="u-fieldLong"
                                supportDataElement
                              />
                            </div>
                          </div>
                          <div className="u-gapTop">
                            <label
                              htmlFor="edgeDomainField"
                              className="spectrum-Form-itemLabel"
                            >
                              IMS Organization ID
                            </label>
                            <div>
                              <WrappedField
                                id="imsOrgIdField"
                                name={`instances.${index}.imsOrgId`}
                                component={Textfield}
                                componentClassName="u-fieldLong"
                                supportDataElement
                              />
                              <Button
                                id="imsOrgIdRestoreButton"
                                label="Restore to default"
                                onClick={() => {
                                  const instanceDefaults = getInstanceDefaults(
                                    initInfo
                                  );
                                  setFieldValue(
                                    `instances.${index}.imsOrgId`,
                                    instanceDefaults.imsOrgId
                                  );
                                }}
                                quiet
                                variant="quiet"
                              />
                            </div>
                          </div>
                          <div className="u-gapTop">
                            <label
                              htmlFor="edgeDomainField"
                              className="spectrum-Form-itemLabel"
                            >
                              Edge Domain
                            </label>
                            <div>
                              <WrappedField
                                id="edgeDomainField"
                                name={`instances.${index}.edgeDomain`}
                                component={Textfield}
                                componentClassName="u-fieldLong"
                                supportDataElement
                              />
                              <Button
                                id="edgeDomainRestoreButton"
                                label="Restore to default"
                                onClick={() => {
                                  const instanceDefaults = getInstanceDefaults(
                                    initInfo
                                  );
                                  setFieldValue(
                                    `instances.${index}.edgeDomain`,
                                    instanceDefaults.edgeDomain
                                  );
                                }}
                                quiet
                                variant="quiet"
                              />
                            </div>
                          </div>
                          <div className="u-gapTop">
                            <WrappedField
                              name={`instances.${index}.errorsEnabled`}
                              component={Checkbox}
                              label="Enable errors"
                            />
                          </div>

                          <h3>Privacy</h3>

                          <div className="u-gapTop">
                            <WrappedField
                              name={`instances.${index}.optInEnabled`}
                              component={Checkbox}
                              label="Enable Opt-In"
                            />
                          </div>

                          <h3>Identity</h3>

                          <div className="u-gapTop">
                            <WrappedField
                              name={`instances.${index}.idSyncEnabled`}
                              component={Checkbox}
                              label="Enable ID Synchronization"
                            />
                          </div>

                          {values.instances[index].idSyncEnabled ? (
                            <div className="FieldSubset u-gapTop">
                              <label
                                htmlFor="idSyncContainerIdField"
                                className="spectrum-Form-itemLabel"
                              >
                                ID Synchronization Container ID (optional)
                              </label>
                              <div>
                                <WrappedField
                                  id="idSyncContainerIdField"
                                  name={`instances.${index}.idSyncContainerId`}
                                  component={Textfield}
                                  componentClassName="u-fieldLong"
                                  supportDataElement
                                />
                              </div>
                            </div>
                          ) : null}

                          <h3>Audiences</h3>

                          <div className="u-gapTop">
                            <WrappedField
                              name={`instances.${index}.destinationsEnabled`}
                              component={Checkbox}
                              label="Enable Destinations"
                            />
                          </div>

                          <h3>Personalization</h3>

                          <div className="u-gapTop">
                            <label
                              htmlFor="prehidingStyleField"
                              className="spectrum-Form-itemLabel"
                            >
                              Prehiding Style (optional)
                            </label>
                            <div>
                              <WrappedField
                                id="prehidingStyleField"
                                name={`instances.${index}.prehidingStyle`}
                                component={EditorButton}
                                language="css"
                              />
                            </div>
                          </div>

                          <h3>Context</h3>

                          <div className="u-gapTop">
                            <label
                              htmlFor="contextGranularityField"
                              className="spectrum-Form-itemLabel"
                            >
                              When sending event data, automatically include:
                            </label>
                            <WrappedField
                              id="contextGranularityField"
                              name={`instances.${index}.contextGranularity`}
                              component={RadioGroup}
                              componentClassName="u-flexColumn"
                            >
                              <Radio
                                value={contextGranularityEnum.ALL}
                                label="all context information"
                              />
                              <Radio
                                value={contextGranularityEnum.SPECIFIC}
                                label="specific context information"
                              />
                            </WrappedField>
                          </div>
                          {values.instances[index].contextGranularity ===
                          contextGranularityEnum.SPECIFIC ? (
                            <div className="FieldSubset u-gapTop">
                              <WrappedField
                                name={`instances.${index}.context`}
                                component={CheckboxList}
                                options={contextOptions}
                              />
                            </div>
                          ) : null}

                          {values.instances.length > 1 ? (
                            <div className="u-gapTop2x">
                              <ModalTrigger>
                                <Button
                                  id="deleteButton"
                                  label="Delete Instance"
                                  icon={<Delete />}
                                  variant="action"
                                />
                                <Dialog
                                  onConfirm={() => {
                                    arrayHelpers.remove(index);
                                    setSelectedAccordionIndex(0);
                                  }}
                                  title="Resource Usage"
                                  confirmLabel="OK"
                                  cancelLabel="Cancel"
                                >
                                  Any rule components or data elements using
                                  this instance will no longer function as
                                  expected when running on your website. We
                                  recommend removing these resources before
                                  publishing your next library. Would you like
                                  to proceed?
                                </Dialog>
                              </ModalTrigger>
                            </div>
                          ) : null}
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                );
              }}
            />
          </div>
        );
      }}
    />
  );
};

render(Configuration);
